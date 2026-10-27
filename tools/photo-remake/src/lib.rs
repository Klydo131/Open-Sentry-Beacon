//! Remakes a photo from its pixels alone.
//!
//! Hope Beacon's photo-check function (supabase/functions/photo-check) cleans
//! a stored photo that still says where it was taken. Usually that is a
//! byte-level cut of the metadata blocks, in TypeScript. This is the other
//! way: decode the picture, turn it the way the camera said it was held,
//! shrink it to the size the browser would have sent (1600 pixels on the long
//! side, JPEG quality 82, lib/live/shrink-image.ts), and encode the pixels
//! again. Nothing of the original file survives but its picture: no EXIF, no
//! XMP, no comment, no bytes after the end, nothing a file could carry hidden.
//!
//! Asked for on 27 October 2026: "We can use Rust for Data security." Built to
//! WebAssembly, so the same file runs in Supabase's functions (Deno) and in the
//! Postgres edition (Node). tools/photo-remake/README.md says how it is built
//! and checked.
//!
//! THE INTERFACE is four functions with plain numbers, so it needs no glue
//! code: the caller asks for room (`alloc`), copies the photo in, calls
//! `remake`, and reads the result from `out_ptr` for the length `remake`
//! returned. 0 means "not a photo this can remake", which includes anything
//! over the limits below.

use image::codecs::jpeg::JpegEncoder;
use image::{DynamicImage, ImageDecoder, ImageReader, Limits};
use std::cell::RefCell;
use std::io::Cursor;

/// The browser's size and quality (lib/live/shrink-image.ts), so a photo
/// cleaned here looks like one cleaned there.
pub const MAX_EDGE: u32 = 1600;
pub const QUALITY: u8 = 82;

/// A decompression bomb is a small file that claims a huge picture. Nothing a
/// phone takes is over 60 megapixels or 20,000 pixels on a side; the memory a
/// decoder may ask for is capped too.
const MAX_SIDE: u32 = 20_000;
const MAX_ALLOC: u64 = 512 * 1024 * 1024;

thread_local! {
    static OUT: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) };
}

/// The photo, remade: decoded, turned upright, shrunk, encoded as a JPEG with
/// nothing in it but the picture. `None` if it is not a picture this can read.
pub fn remake_bytes(input: &[u8]) -> Option<Vec<u8>> {
    let mut limits = Limits::default();
    limits.max_image_width = Some(MAX_SIDE);
    limits.max_image_height = Some(MAX_SIDE);
    limits.max_alloc = Some(MAX_ALLOC);

    let mut reader = ImageReader::new(Cursor::new(input)).with_guessed_format().ok()?;
    reader.limits(limits);
    let mut decoder = reader.into_decoder().ok()?;
    let (w, h) = decoder.dimensions();
    if (w as u64) * (h as u64) > 60_000_000 {
        return None;
    }
    let orientation = decoder.orientation().ok();
    let mut picture = DynamicImage::from_decoder(decoder).ok()?;

    // SHRINK FIRST, THEN TURN. Measured on a 12-megapixel photo: a filtered
    // resize keeps full-size float buffers and turning the full picture copies
    // it, and together they took the WebAssembly memory to 174 MB, too near a
    // Supabase function's 256 MB. `thumbnail` averages in integers, and
    // turning a 1600-pixel picture costs a sixth of turning a 4000-pixel one.
    if picture.width().max(picture.height()) > MAX_EDGE {
        picture = picture.thumbnail(MAX_EDGE, MAX_EDGE);
    }
    if let Some(o) = orientation {
        picture.apply_orientation(o);
    }

    // A JPEG has no transparency: flatten onto white, as a canvas does.
    let rgb = if picture.color().has_alpha() {
        let rgba = picture.to_rgba8();
        let mut flat = image::RgbImage::new(rgba.width(), rgba.height());
        for (x, y, p) in rgba.enumerate_pixels() {
            let a = p[3] as u32;
            let mix = |c: u8| ((c as u32 * a + 255 * (255 - a)) / 255) as u8;
            flat.put_pixel(x, y, image::Rgb([mix(p[0]), mix(p[1]), mix(p[2])]));
        }
        flat
    } else {
        picture.to_rgb8()
    };

    let mut out = Vec::with_capacity(rgb.len() / 8);
    JpegEncoder::new_with_quality(&mut out, QUALITY).encode_image(&rgb).ok()?;
    Some(out)
}

/// Room for `len` bytes, for the caller to copy a photo into.
#[no_mangle]
pub extern "C" fn alloc(len: usize) -> *mut u8 {
    let mut buffer = Vec::<u8>::with_capacity(len);
    let pointer = buffer.as_mut_ptr();
    std::mem::forget(buffer);
    pointer
}

/// Gives back room from `alloc`.
///
/// # Safety
/// `pointer` and `capacity` must be exactly what `alloc` was given and returned.
#[no_mangle]
pub unsafe extern "C" fn dealloc(pointer: *mut u8, capacity: usize) {
    drop(Vec::from_raw_parts(pointer, 0, capacity));
}

/// Remakes the `len` bytes at `pointer`. Returns the result's length (read it
/// at `out_ptr`), or 0 if they are not a photo this can remake.
///
/// # Safety
/// `pointer` must point to `len` readable bytes.
#[no_mangle]
pub unsafe extern "C" fn remake(pointer: *const u8, len: usize) -> usize {
    let input = std::slice::from_raw_parts(pointer, len);
    let result = remake_bytes(input).unwrap_or_default();
    OUT.with(|out| {
        let mut out = out.borrow_mut();
        *out = result;
        out.len()
    })
}

/// Where the last result is.
#[no_mangle]
pub extern "C" fn out_ptr() -> *const u8 {
    OUT.with(|out| out.borrow().as_ptr())
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{ImageFormat, RgbImage};

    fn jpeg(w: u32, h: u32) -> Vec<u8> {
        let img = RgbImage::from_fn(w, h, |x, y| image::Rgb([(x % 256) as u8, (y % 256) as u8, 128]));
        let mut out = Vec::new();
        JpegEncoder::new_with_quality(&mut out, 90).encode_image(&img).unwrap();
        out
    }

    /// A JPEG with an EXIF block that says where it was taken, inserted after SOI.
    fn located(mut bytes: Vec<u8>) -> Vec<u8> {
        let tiff: [u8; 26] = [0x49, 0x49, 42, 0, 8, 0, 0, 0, 1, 0, 0x25, 0x88, 4, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        let mut seg = vec![0xff, 0xe1, 0, (2 + 6 + tiff.len()) as u8];
        seg.extend_from_slice(b"Exif\0\0");
        seg.extend_from_slice(&tiff);
        bytes.splice(2..2, seg);
        bytes
    }

    #[test]
    fn a_located_photo_comes_back_without_its_exif_block() {
        let out = remake_bytes(&located(jpeg(64, 48))).expect("remade");
        assert_eq!(&out[..2], &[0xff, 0xd8]);
        assert!(!out.windows(4).any(|w| w == b"Exif"));
        assert_eq!(image::guess_format(&out).unwrap(), ImageFormat::Jpeg);
    }

    #[test]
    fn a_large_photo_is_shrunk_to_the_browsers_size() {
        let out = remake_bytes(&jpeg(3200, 2400)).expect("remade");
        let img = image::load_from_memory(&out).unwrap();
        assert_eq!((img.width(), img.height()), (1600, 1200));
    }

    #[test]
    fn a_photo_held_upright_comes_back_upright() {
        // EXIF orientation 6: the camera was turned a quarter clockwise.
        let tiff: [u8; 26] = [0x49, 0x49, 42, 0, 8, 0, 0, 0, 1, 0, 0x12, 0x01, 3, 0, 1, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0];
        let mut bytes = jpeg(80, 40);
        let mut seg = vec![0xff, 0xe1, 0, (2 + 6 + tiff.len()) as u8];
        seg.extend_from_slice(b"Exif\0\0");
        seg.extend_from_slice(&tiff);
        bytes.splice(2..2, seg);
        let img = image::load_from_memory(&remake_bytes(&bytes).expect("remade")).unwrap();
        assert_eq!((img.width(), img.height()), (40, 80));
    }

    #[test]
    fn bytes_after_the_end_do_not_survive() {
        let mut bytes = jpeg(32, 32);
        bytes.extend_from_slice(b"HIDDEN PAYLOAD");
        let out = remake_bytes(&bytes).expect("remade");
        assert!(!out.windows(6).any(|w| w == b"HIDDEN"));
    }

    #[test]
    fn what_is_not_a_photo_is_refused() {
        assert!(remake_bytes(b"not a photo at all").is_none());
        assert!(remake_bytes(&[0xff, 0xd8, 0xff, 0xe1, 0x00]).is_none());
    }
}
