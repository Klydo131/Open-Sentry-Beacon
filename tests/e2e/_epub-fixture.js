// Small EPUB files for the tests, written by hand: a zip needs no library.
// `sample()` is a three-chapter book; `hostile()` carries everything a book
// must not be allowed to do; `bomb()` is a small file that inflates to 40 MB.

const zlib = require('node:zlib');

const table = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = table[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

/** files: [{ name, data: Buffer|string, store?: boolean }] */
function zip(files) {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name);
    const raw = Buffer.isBuffer(f.data) ? f.data : Buffer.from(f.data);
    const packed = f.store ? raw : zlib.deflateRawSync(raw, { level: 9 });
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(0, 6);
    head.writeUInt16LE(f.store ? 0 : 8, 8); head.writeUInt32LE(crc32(raw), 14);
    head.writeUInt32LE(packed.length, 18); head.writeUInt32LE(raw.length, 22); head.writeUInt16LE(name.length, 26);
    parts.push(head, name, packed);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6);
    c.writeUInt16LE(f.store ? 0 : 8, 10); c.writeUInt32LE(crc32(raw), 16);
    c.writeUInt32LE(packed.length, 20); c.writeUInt32LE(raw.length, 24); c.writeUInt16LE(name.length, 28);
    c.writeUInt32LE(offset, 42);
    central.push(c, name);
    offset += head.length + name.length + packed.length;
  }
  const dir = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(dir.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, dir, end]);
}

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

const container = '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>';

const opf = (title, extraManifest = '') => `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">sample</dc:identifier><dc:title>${title}</dc:title><dc:creator>A. Writer</dc:creator><dc:language>en</dc:language></metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="c1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
<item id="c2" href="ch2.xhtml" media-type="application/xhtml+xml"/>
<item id="c3" href="ch3.xhtml" media-type="application/xhtml+xml"/>
<item id="pic" href="images/dot.png" media-type="image/png"/>${extraManifest}
</manifest>
<spine><itemref idref="c1"/><itemref idref="c2"/><itemref idref="c3"/></spine>
</package>`;

const nav = '<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body><nav epub:type="toc"><ol>'
  + '<li><a href="ch1.xhtml">Chapter One</a></li>'
  + '<li><a href="ch2.xhtml">Chapter Two</a><ol><li><a href="ch2.xhtml#sec">Section 2.1</a></li></ol></li>'
  + '<li><a href="ch3.xhtml">Chapter Three</a></li></ol></nav></body></html>';

const para = (n, who) => `<p>${who} paragraph ${n}. The quick brown fox jumps over the lazy dog while the congregation sings together, and the morning light fills the room with a quiet, steady glow.</p>`;
const page = (body) => `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>x</title></head><body>${body}</body></html>`;

function sample() {
  const ch1 = page('<h1>Chapter One</h1><p><img src="images/dot.png" alt="A dot"/></p>'
    + Array.from({ length: 40 }, (_, i) => para(i + 1, 'First')).join('')
    + '<p><a href="ch2.xhtml#sec">Jump to section 2.1</a> and <a href="https://example.invalid/out">an outside link</a>.</p>');
  const ch2 = page('<h1>Chapter Two</h1>' + Array.from({ length: 12 }, (_, i) => para(i + 1, 'Second')).join('')
    + '<h2 id="sec">Section 2.1</h2>' + Array.from({ length: 12 }, (_, i) => para(i + 1, 'Deeper')).join(''));
  const ch3 = page('<h1>Chapter Three</h1><p>The last chapter. THE END MARKER.</p>');
  return zip([
    { name: 'mimetype', data: 'application/epub+zip', store: true },
    { name: 'META-INF/container.xml', data: container },
    { name: 'OEBPS/content.opf', data: opf('Sample Book') },
    { name: 'OEBPS/nav.xhtml', data: nav },
    { name: 'OEBPS/ch1.xhtml', data: ch1 },
    { name: 'OEBPS/ch2.xhtml', data: ch2 },
    { name: 'OEBPS/ch3.xhtml', data: ch3 },
    { name: 'OEBPS/images/dot.png', data: PNG, store: true },
  ]);
}

function hostile() {
  const ch1 = page('<h1>Hostile Chapter</h1><p>VISIBLE WORDS</p>'
    + '<script>window.__pwned = 1; fetch("https://example.invalid/script")</script>'
    + '<img src="https://example.invalid/tracker.png" alt="remote picture"/>'
    + '<img src="images/dot.png" onerror="window.__pwned = 2" onload="window.__pwned = 3"/>'
    + '<p onclick="window.__pwned = 4" style="background:url(https://example.invalid/css)">KEPT TEXT</p>'
    + '<a href="javascript:window.__pwned = 5">js link</a>'
    + '<iframe src="https://example.invalid/frame"></iframe><object data="https://example.invalid/o"></object>'
    + '<style>@import url(https://example.invalid/style.css); body { display: none }</style>'
    + '<svg onload="window.__pwned = 6"><script>window.__pwned = 7</script></svg>'
    + '<form action="https://example.invalid/post"><input name="q"/><button>Send</button></form>'
    + '<link rel="stylesheet" href="https://example.invalid/l.css"/>');
  return zip([
    { name: 'mimetype', data: 'application/epub+zip', store: true },
    { name: 'META-INF/container.xml', data: container },
    { name: 'OEBPS/content.opf', data: opf('Hostile Book') },
    { name: 'OEBPS/nav.xhtml', data: nav },
    { name: 'OEBPS/ch1.xhtml', data: ch1 },
    { name: 'OEBPS/ch2.xhtml', data: page('<p>two</p>') },
    { name: 'OEBPS/ch3.xhtml', data: page('<p>three</p>') },
    { name: 'OEBPS/images/dot.png', data: PNG, store: true },
  ]);
}

function bomb() {
  return zip([
    { name: 'mimetype', data: 'application/epub+zip', store: true },
    { name: 'META-INF/container.xml', data: container },
    { name: 'OEBPS/content.opf', data: opf('Bomb Book') },
    { name: 'OEBPS/nav.xhtml', data: nav },
    { name: 'OEBPS/ch1.xhtml', data: Buffer.alloc(40_000_000, 0x20) },
    { name: 'OEBPS/ch2.xhtml', data: page('<p>two</p>') },
    { name: 'OEBPS/ch3.xhtml', data: page('<p>three</p>') },
  ]);
}

module.exports = { zip, sample, hostile, bomb, PNG };
