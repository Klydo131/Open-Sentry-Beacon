# The photo remaker (Rust)

A small Rust library that remakes a photo from its pixels alone. It powers the
server half of a promise the app makes on its privacy page: the location your
camera recorded is removed from a photo before it is kept.

## Where it runs

The app removes a photo's location in the browser, before sending it. A
modified copy of the app, or somebody calling the file store directly, can skip
that. For those photos the `photo-check` function (`supabase/functions/photo-check`)
cleans the file on the server once it arrives. For a JPEG that says where it was
taken, it uses this remaker first:

1. decode the picture;
2. shrink it to the size the browser would have sent (1600 pixels on the long
   side);
3. turn it the way the camera was held;
4. encode it again as a JPEG at quality 82, the browser's own setting.

Nothing of the original file survives but its picture. No EXIF, no XMP, no
comment, and no bytes hidden after the end of the picture. If the remaker
cannot read a photo, the function falls back to cutting the metadata blocks out
in TypeScript. If that fails too, the photo is removed.

It is compiled to WebAssembly. One file then runs in both places: Supabase's
functions, which run on Deno, and the Postgres edition, which runs them on
Node. The WebAssembly imports nothing, so it cannot reach the network, a file
or the clock. It only sees the bytes it is given.

## Measured

Measured on 27 October 2026, in Node 22 on a 2.1 GHz Xeon. Node and Deno run
WebAssembly with the same engine, V8.

| Photo | CPU time | WebAssembly memory |
|---|---|---|
| Loading the module (once per function instance) | about 0.1 s | |
| 3 megapixels, 1.8 MB | 0.20 to 0.45 s | 20 MB |
| 12 megapixels, 7.2 MB (heavy noise, harder than a real photo) | 0.49 to 0.53 s | 63 MB |

A Supabase function may use 2 seconds of CPU time and 256 MB of memory per
request. The first version kept full-size working copies while shrinking, and a
12-megapixel photo took its memory to 174 MB. It now shrinks first, using an
integer average, and turns the picture afterwards.

These figures are not from Supabase's own machines, which were not available
for this. They may be slower.

## Build and check

You need Rust 1.97.0 (`rust-toolchain.toml` installs it) and the
`wasm32-unknown-unknown` target.

```sh
cd tools/photo-remake
cargo test --release                      # the Rust checks, run natively
node build.mjs                            # build, and write supabase/functions/_shared/photo-remake-wasm.ts
node build.mjs --check                    # build, and fail if the committed copy is not what this source builds
python3 licences.py                       # rewrite THIRD-PARTY-LICENCES.txt
```

The committed module carries the WebAssembly as base64 text, with its SHA-256
beside it. `tests/a-photo-is-remade-in-rust.mjs` runs in the app's gate. It
checks:

- the text still decodes to that checksum;
- the module imports nothing;
- a real test photo comes back upright, without its location, and without
  bytes hidden after its end.

`--check` proves the committed file is what the Rust source builds. On this
machine two builds gave the same checksum. A different machine or Rust version
may not.

## Licences

The remaker is part of Open Sentry Beacon (AGPL-3.0-only). The 21 Rust
libraries compiled into it are all permissively licensed: MIT, Apache-2.0,
Zlib or BSD-3-Clause. `NOTICES.md` lists them, and `THIRD-PARTY-LICENCES.txt`
holds each one's licence files, as each library ships them.
