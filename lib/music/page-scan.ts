// Turning a photo of a page of music into a clean page: straightened, cropped
// to the paper, and made black on white so it reads on a phone in a dim church.
//
// HOW. The person drags four corners onto the corners of the paper (the room
// starts them just inside the photo's edges). The four points define a
// perspective map from the flat page to the photo; every pixel of the clean
// page is looked up through it (`warp`). Then each pixel is compared with the
// average brightness around it (`clean`): ink is darker than the paper near it,
// whatever the lighting, so a shadow across the page does not turn into a
// black band the way a single threshold would.
//
// Pure arithmetic on pixel arrays: no browser, no library, nothing sent
// anywhere. tests/the-music-room.mjs runs it.

export type Point = [number, number];

/** A page's shape: A4 and US Letter are both close to 1 : 1.41. */
export const PAGE_RATIO = 1.414;
/** Wide enough to read a printed score on a phone, small enough to keep many. */
export const PAGE_WIDTH = 1240;

export interface Pixels {
  width: number;
  height: number;
  /** RGBA, 4 bytes a pixel, as ImageData holds them. */
  data: Uint8ClampedArray;
}

/** Corners to start from: just inside the photo, top-left then clockwise. */
export function startingCorners(width: number, height: number): [Point, Point, Point, Point] {
  const x = width * 0.06;
  const y = height * 0.06;
  return [[x, y], [width - x, y], [width - x, height - y], [x, height - y]];
}

/** Solve a small linear system by Gaussian elimination with partial pivoting. */
function solve(a: number[][], b: number[]): number[] | null {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    if (Math.abs(m[pivot][col]) < 1e-12) return null;
    [m[col], m[pivot]] = [m[pivot], m[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = m[r][col] / m[col][col];
      for (let c = col; c <= n; c++) m[r][c] -= f * m[col][c];
    }
  }
  return m.map((row, i) => row[n] / row[i]);
}

/**
 * The perspective map taking the four corners of a w-by-h page, clockwise from
 * top-left, to the four points `to`. Returns a function, or null when the
 * points cannot be a page (three in a line, two on top of each other).
 */
export function pageToPhoto(w: number, h: number, to: [Point, Point, Point, Point]): ((x: number, y: number) => Point) | null {
  const from: Point[] = [[0, 0], [w, 0], [w, h], [0, h]];
  const a: number[][] = [];
  const b: number[] = [];
  from.forEach(([x, y], i) => {
    const [u, v] = to[i];
    a.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    a.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  });
  const k = solve(a, b);
  if (!k || k.some((n) => !Number.isFinite(n))) return null;
  return (x, y) => {
    const d = k[6] * x + k[7] * y + 1;
    return [(k[0] * x + k[1] * y + k[2]) / d, (k[3] * x + k[4] * y + k[5]) / d];
  };
}

/** Is this a shape a page could be: four corners, clockwise, not folded over itself? */
export function isPageShape(c: [Point, Point, Point, Point]): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = c[i];
    const [bx, by] = c[(i + 1) % 4];
    const [cx, cy] = c[(i + 2) % 4];
    const cross = (bx - ax) * (cy - by) - (by - ay) * (cx - bx);
    if (Math.abs(cross) < 1e-6) return false;
    if (sign === 0) sign = Math.sign(cross);
    else if (Math.sign(cross) !== sign) return false;
  }
  return true;
}

/** The page inside `corners`, flattened to `width` wide, as grey levels (one byte a pixel). */
export function warp(src: Pixels, corners: [Point, Point, Point, Point], width = PAGE_WIDTH): { width: number; height: number; grey: Uint8ClampedArray } | null {
  if (!isPageShape(corners)) return null;
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(width * PAGE_RATIO));
  const map = pageToPhoto(w, h, corners);
  if (!map) return null;
  const grey = new Uint8ClampedArray(w * h);
  const sw = src.width;
  const sh = src.height;
  const lum = (x: number, y: number) => {
    const i = (y * sw + x) * 4;
    return 0.299 * src.data[i] + 0.587 * src.data[i + 1] + 0.114 * src.data[i + 2];
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [u, v] = map(x + 0.5, y + 0.5);
      if (!(u >= 0 && v >= 0 && u < sw - 1 && v < sh - 1)) { grey[y * w + x] = 255; continue; }
      // Bilinear: a weighted mix of the four photo pixels around the point.
      const x0 = Math.floor(u);
      const y0 = Math.floor(v);
      const fx = u - x0;
      const fy = v - y0;
      const top = lum(x0, y0) * (1 - fx) + lum(x0 + 1, y0) * fx;
      const bottom = lum(x0, y0 + 1) * (1 - fx) + lum(x0 + 1, y0 + 1) * fx;
      grey[y * w + x] = top * (1 - fy) + bottom * fy;
    }
  }
  return { width: w, height: h, grey };
}

/**
 * Black ink on white paper, judged against the light around each pixel: a
 * pixel noticeably darker than its neighbourhood is ink, and the darker the
 * blacker; everything else is paper. RGBA out, ready for a canvas.
 */
export function clean(grey: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
  // A neighbourhood about a fortieth of the page wide: wider than a stave
  // line or a notehead, narrower than a shadow.
  const r = Math.max(4, Math.round(width / 40));
  // Summed-area table, so every neighbourhood's average costs four lookups.
  const sum = new Float64Array((width + 1) * (height + 1));
  for (let y = 0; y < height; y++) {
    let row = 0;
    for (let x = 0; x < width; x++) {
      row += grey[y * width + x];
      sum[(y + 1) * (width + 1) + x + 1] = sum[y * (width + 1) + x + 1] + row;
    }
  }
  const out = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(height, y + r + 1);
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(width, x + r + 1);
      const area = (x1 - x0) * (y1 - y0);
      const total = sum[y1 * (width + 1) + x1] - sum[y0 * (width + 1) + x1] - sum[y1 * (width + 1) + x0] + sum[y0 * (width + 1) + x0];
      const mean = Math.max(1, total / area);
      const ratio = grey[y * width + x] / mean;
      // At or above 92% of the light around it, paper. Below, shading to black
      // by 60%.
      const level = ratio >= 0.92 ? 255 : Math.max(0, Math.min(255, ((ratio - 0.6) / 0.32) * 255));
      const i = (y * width + x) * 4;
      out[i] = out[i + 1] = out[i + 2] = level;
      out[i + 3] = 255;
    }
  }
  return out;
}
