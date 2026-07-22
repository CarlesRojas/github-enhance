// Generates the extension's PNG icons with no image libraries — a dark rounded
// square with a gradient "spark" diamond. Run with: npm run icons
import { deflateSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function inRounded(x, y, size, r) {
  const l = r;
  const rr = size - r - 1;
  const near = (cx, cy) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  if (x < l && y < l) return near(l, l);
  if (x > rr && y < l) return near(rr, l);
  if (x < l && y > rr) return near(l, rr);
  if (x > rr && y > rr) return near(rr, rr);
  return true;
}

function lerp(a, b, t) {
  return Math.round(a + (b - a) * t);
}

function renderPng(size) {
  const r = Math.round(size * 0.22);
  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2;
  const rad = size * 0.36;

  // Raw image data: one filter byte (0) per row, then RGBA pixels.
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(stride * size);

  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const o = y * stride + 1 + x * 4;
      if (!inRounded(x, y, size, r)) {
        raw[o] = raw[o + 1] = raw[o + 2] = raw[o + 3] = 0;
        continue;
      }
      const diamond = Math.abs(x - cx) / rad + Math.abs(y - cy) / rad <= 1;
      if (diamond) {
        const t = (y - (cy - rad)) / (2 * rad);
        raw[o] = lerp(163, 47, t); // a371f7 -> 2f81f7
        raw[o + 1] = lerp(113, 129, t);
        raw[o + 2] = lerp(247, 247, t);
        raw[o + 3] = 255;
      } else {
        raw[o] = 22; // #161b22
        raw[o + 1] = 27;
        raw[o + 2] = 34;
        raw[o + 3] = 255;
      }
    }
  }

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const idat = deflateSync(raw, { level: 9 });

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const dir = new URL('../src/icons/', import.meta.url);
await mkdir(dir, { recursive: true });
for (const size of [16, 48, 128]) {
  await writeFile(new URL(`icon${size}.png`, dir), renderPng(size));
  console.log(`wrote src/icons/icon${size}.png`);
}
