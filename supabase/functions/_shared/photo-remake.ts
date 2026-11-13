// The Rust photo remaker (tools/photo-remake), as WebAssembly, for the
// photo-check function. remakePhoto(bytes) decodes a JPEG, PNG or WebP, turns
// it the way the camera was held, shrinks it to the browser's 1600 pixels and
// encodes the pixels again as a JPEG with nothing else in it. null means it is
// not a picture the remaker can read, or it is over its limits.
//
// The same code runs on Supabase (Deno) and in the Postgres edition (Node):
// the module is carried as base64 text, and WebAssembly and atob are in both.

import { WASM_BASE64 } from './photo-remake-wasm.ts';

type Remaker = {
  memory: WebAssembly.Memory;
  alloc: (len: number) => number;
  dealloc: (pointer: number, capacity: number) => void;
  remake: (pointer: number, len: number) => number;
  out_ptr: () => number;
};

let ready: Promise<Remaker> | null = null;

function load(): Promise<Remaker> {
  ready ??= (async () => {
    const binary = Uint8Array.from(atob(WASM_BASE64), (c) => c.charCodeAt(0));
    const { instance } = await WebAssembly.instantiate(binary, {});
    return instance.exports as unknown as Remaker;
  })();
  return ready;
}

export async function remakePhoto(input: Uint8Array): Promise<Uint8Array | null> {
  const r = await load();
  const pointer = r.alloc(input.length);
  // The memory may have grown in alloc, so its buffer is read after.
  new Uint8Array(r.memory.buffer, pointer, input.length).set(input);
  let length = 0;
  try {
    length = r.remake(pointer, input.length);
  } finally {
    r.dealloc(pointer, input.length);
  }
  if (!length) return null;
  return new Uint8Array(r.memory.buffer, r.out_ptr(), length).slice();
}
