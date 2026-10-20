// Runs the court room's real forensic code, as shipped, against files built
// here byte by byte. Prints one line of JSON for tests/the-court-room-keeps-its-promises.mjs.

import {
  checkChain, genesis, pictureDetails, recordLine, sha256Hex, showAs, sniff, typeFinding,
  type RecordEntry,
} from '@/lib/court/forensics';
import { recordText } from '@/lib/court/record-text';

const bytes = (...parts: Array<number[] | string>) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === 'string' ? Array.from(Buffer.from(p, 'binary')) : p)));

/** A JPEG whose EXIF names a camera, a time and a place. */
function jpegWithExif(): Uint8Array {
  const le16 = (n: number) => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; };
  const le32 = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };
  const ascii = (s: string) => Buffer.from(`${s}\0`, 'ascii');
  const make = ascii('FixtureCam'); const model = ascii('Z9 Mark II'); const taken = ascii('2026:09:30 18:05:00');
  const ifd0 = 8; const exifIfd = ifd0 + 2 + 4 * 12 + 4; const gpsIfd = exifIfd + 2 + 12 + 4;
  let data = gpsIfd + 2 + 4 * 12 + 4;
  const makeAt = data; data += make.length;
  const modelAt = data; data += model.length;
  const takenAt = data; data += taken.length;
  const latAt = data; data += 24; const lonAt = data;
  const entry = (tag: number, type: number, count: number, value: Buffer) =>
    Buffer.concat([le16(tag), le16(type), le32(count), value]);
  const ref = (s: string) => { const b = Buffer.alloc(4); b.write(s, 'ascii'); return b; };
  const rat = (pairs: number[][]) => Buffer.concat(pairs.flatMap(([a, b]) => [le32(a), le32(b)]));
  const tiff = Buffer.concat([
    Buffer.from('II'), le16(42), le32(ifd0),
    le16(4), entry(0x010f, 2, make.length, le32(makeAt)), entry(0x0110, 2, model.length, le32(modelAt)),
    entry(0x8769, 4, 1, le32(exifIfd)), entry(0x8825, 4, 1, le32(gpsIfd)), le32(0),
    le16(1), entry(0x9003, 2, taken.length, le32(takenAt)), le32(0),
    le16(4), entry(0x0001, 2, 2, ref('S')), entry(0x0002, 5, 3, le32(latAt)),
    entry(0x0003, 2, 2, ref('W')), entry(0x0004, 5, 3, le32(lonAt)), le32(0),
    make, model, taken, rat([[33, 1], [52, 1], [0, 1]]), rat([[151, 1], [12, 1], [36, 1]]),
  ]);
  const body = Buffer.concat([Buffer.from('Exif\0\0', 'binary'), tiff]);
  const len = Buffer.alloc(2); len.writeUInt16BE(body.length + 2);
  return new Uint8Array(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe1]), len, body, Buffer.from([0xff, 0xd9])]));
}

async function main() {
  const r: Record<string, unknown> = {};

  // The fingerprint is SHA-256, as everybody else computes it.
  r.sha256Known = (await sha256Hex('abc')) === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
  r.sha256Bytes = (await sha256Hex(new Uint8Array([0x61, 0x62, 0x63]))) === (await sha256Hex('abc'));

  // What a file really is.
  const jpeg = jpegWithExif();
  const png = bytes([0x89], 'PNG\r\n\x1a\n', [0, 0, 0, 13], 'IHDR', [0, 0, 1, 0, 0, 0, 0, 200]);
  const pdf = bytes('%PDF-1.7\n');
  const html = bytes([0xef, 0xbb, 0xbf], '  <!DOCTYPE html><html><script>alert(1)</script>');
  const svg = bytes('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"></svg>');
  const exe = bytes('MZ', [0x90, 0, 3, 0]);
  const mov = bytes([0, 0, 0, 20], 'ftypqt  ', [0, 0, 0, 0]);
  const heic = bytes([0, 0, 0, 24], 'ftypheic', [0, 0, 0, 0]);
  const text = bytes('A message, copied out.\nSecond line.\n');
  r.sniffs = [jpeg, png, pdf, html, svg, exe, mov, heic, text].map((b) => sniff(b)?.mime ?? null);
  r.runs = [html, svg, exe].map((b) => Boolean(sniff(b)?.runs));

  const honest = typeFinding('photo.jpg', 'image/jpeg', sniff(jpeg));
  const disguised = typeFinding('photo.jpg', 'image/jpeg', sniff(html));
  const program = typeFinding('notes.txt', 'text/plain', sniff(exe));
  const renamed = typeFinding('scan.pdf', 'application/pdf', sniff(jpeg));
  r.honest = honest.agrees && honest.storeAs === 'image/jpeg';
  r.disguisedRefused = !disguised.agrees && disguised.storeAs === null;
  r.programRefused = program.storeAs === null;
  r.renamedFound = !renamed.agrees && renamed.storeAs === 'image/jpeg';

  // Nothing that runs is ever shown inside the app.
  r.showAs = ['image/jpeg', 'image/svg+xml', 'text/html', 'application/pdf', 'video/mp4', 'text/plain', 'image/heic']
    .map((m) => showAs(m));

  // What a picture says about itself, and nothing breaks on a bad one.
  const d = pictureDetails(jpeg);
  r.picture = d;
  r.pngSize = pictureDetails(png);
  let threw = false;
  try {
    for (let cut = 4; cut < jpeg.length; cut += 7) pictureDetails(jpeg.subarray(0, cut));
    const noisy = new Uint8Array(jpeg);
    for (let i = 30; i < noisy.length; i += 5) noisy[i] = (noisy[i] * 31 + 7) & 0xff;
    pictureDetails(noisy);
    pictureDetails(new Uint8Array(0));
  } catch {
    threw = true;
  }
  r.hostileFilesDoNotThrow = !threw;

  // The record: chained, checked, and broken where it is broken.
  const trial = '0b7c6c8e-1111-4222-8333-944455556666';
  const acts: Array<Omit<RecordEntry, 'prev_hash' | 'hash'>> = [
    { seq: 1, at: '', at_us: 1792500000000001, actor_id: 'aaaaaaaa-0000-4000-8000-000000000001', actor_name: 'Judge', act: 'opened', about: await sha256Hex('Summary'), detail: 'Case opened about Someone' },
    { seq: 2, at: '', at_us: 1792500000000002, actor_id: null, actor_name: 'The app', act: 'summoned', about: 'x', detail: 'Someone called' },
    { seq: 3, at: '', at_us: 1792500000000003, actor_id: 'aaaaaaaa-0000-4000-8000-000000000002', actor_name: 'Accused', act: 'statement', about: await sha256Hex('My answer'), detail: 'Statement 1' },
  ];
  const chain: RecordEntry[] = [];
  let prev = await genesis(trial);
  for (const a of acts) {
    const hash = await sha256Hex(recordLine(prev, a));
    chain.push({ ...a, prev_hash: prev, hash });
    prev = hash;
  }
  r.genesis = (await genesis(trial)) === (await sha256Hex(`Hope Beacon court record\n${trial}`));
  r.chainHolds = (await checkChain(trial, chain)).holds;
  const tampered = chain.map((e) => (e.seq === 2 ? { ...e, detail: 'Someone else called' } : e));
  r.tamperFoundAt = (await checkChain(trial, tampered)).brokenAt;
  const removed = chain.filter((e) => e.seq !== 2);
  r.removalFound = !(await checkChain(trial, removed)).holds;
  r.otherCase = !(await checkChain('0b7c6c8e-1111-4222-8333-000000000000', chain)).holds;

  // A saved record carries every fingerprint, and how to check them.
  const saved = recordText({
    case: {
      id: trial, summary: 'Summary', status: 'closed', verdict: 'dismissed', verdict_note: 'Both heard',
      opened_at: '2026-10-20T00:00:00Z', closed_at: '2026-10-21T00:00:00Z', subject_id: null,
      subject_name: 'Someone', opener_name: 'Judge', judge_id: null, judge_name: 'Judge',
      escalation: null, gallery_open: true, seal_hash: chain[2].hash, sealed_at: null,
      my_place: 'judge', i_lead: true, may_speak: false, may_present: false, may_decide: false,
    },
    people: [],
    statements: [{ id: 's1', author_id: null, author_name: 'Accused', for_name: null, body: 'My answer', sha256: await sha256Hex('My answer'), at: '2026-10-20T01:00:00Z' }],
    exhibits: [{ id: 'e1', label: 'A', kind: 'file', title: 'Photo', note: null, file_name: 'p.jpg', mime: 'image/jpeg', size_bytes: jpeg.length, writing: null, sha256: await sha256Hex(jpeg), path: 'x', shown_to: 'everyone', entered_name: 'Judge', entered_at: '2026-10-20T02:00:00Z' }],
    record: chain,
  }, null, 'Tester');
  r.savedHasEverything = [await sha256Hex('My answer'), await sha256Hex(jpeg), ...chain.map((e) => e.hash)]
    .every((h) => saved.includes(h)) && /HOW TO CHECK THIS FILE/.test(saved) && /sha256sum/.test(saved);

  console.log(JSON.stringify(r));
}

main().catch((e) => { console.log(JSON.stringify({ threw: String(e?.message ?? e) })); });
