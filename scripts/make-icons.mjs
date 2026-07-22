// Generates the extension's PNG icons with no image libraries: the GitHub
// mark, filled with a pastel-blue → pastel-teal diagonal gradient, on a
// transparent background. Run with: npm run icons
import { deflateSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';

// GitHub mark, 24×24 viewBox (all cubic béziers), from the GitHub brand.
const MARK =
  'M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12';

const BLUE = [0x86, 0xc1, 0xff]; // pastel blue        (#86c1ff)
const TEAL = [0x84, 0xe0, 0xa8]; // pastel green-teal  (#84e0a8)
const PADDING = 0.1; // fraction of the icon left as margin around the mark

// --- SVG path → flattened polylines (in the 24×24 path space) --------------

function flattenCubic(pts, x0, y0, x1, y1, x2, y2, x3, y3) {
  const N = 18;
  for (let k = 1; k <= N; k++) {
    const t = k / N;
    const mt = 1 - t;
    const a = mt * mt * mt;
    const b = 3 * mt * mt * t;
    const c = 3 * mt * t * t;
    const d = t * t * t;
    pts.push([a * x0 + b * x1 + c * x2 + d * x3, a * y0 + b * y1 + c * y2 + d * y3]);
  }
}

function parsePath(dStr) {
  const tokens = dStr.match(/[a-zA-Z]|-?\d*\.?\d+(?:[eE][-+]?\d+)?/g);
  const subpaths = [];
  let cur = null;
  let cx = 0, cy = 0, sx = 0, sy = 0, cmd = 'M', i = 0;
  const num = () => parseFloat(tokens[i++]);

  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) cmd = tokens[i++];
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();

    if (C === 'M') {
      let x = num(), y = num();
      if (rel) { x += cx; y += cy; }
      cx = sx = x;
      cy = sy = y;
      cur = [[x, y]];
      subpaths.push(cur);
      cmd = rel ? 'l' : 'L'; // extra pairs after a moveto are linetos
    } else if (C === 'L') {
      let x = num(), y = num();
      if (rel) { x += cx; y += cy; }
      cur.push([(cx = x), (cy = y)]);
    } else if (C === 'C') {
      let x1 = num(), y1 = num(), x2 = num(), y2 = num(), x = num(), y = num();
      if (rel) { x1 += cx; y1 += cy; x2 += cx; y2 += cy; x += cx; y += cy; }
      flattenCubic(cur, cx, cy, x1, y1, x2, y2, x, y);
      cx = x;
      cy = y;
    } else if (C === 'Z') {
      cur.push([sx, sy]);
      cx = sx;
      cy = sy;
    } else {
      i++; // unknown command: skip a value to stay in sync
    }
  }
  return subpaths;
}

const SUBPATHS = parsePath(MARK);

/** Edges (x0,y0,x1,y1) for the mark, scaled/offset into the icon's pixels. */
function buildEdges(scale, offset) {
  const edges = [];
  for (const poly of SUBPATHS) {
    for (let k = 0; k < poly.length; k++) {
      const [x0, y0] = poly[k];
      const [x1, y1] = poly[(k + 1) % poly.length];
      edges.push([x0 * scale + offset, y0 * scale + offset, x1 * scale + offset, y1 * scale + offset]);
    }
  }
  return edges;
}

/** Non-zero winding test — true when (px,py) is inside the filled mark. */
function inside(px, py, edges) {
  let wn = 0;
  for (const [x0, y0, x1, y1] of edges) {
    if (y0 <= py) {
      if (y1 > py && (x1 - x0) * (py - y0) - (px - x0) * (y1 - y0) > 0) wn++;
    } else if (y1 <= py && (x1 - x0) * (py - y0) - (px - x0) * (y1 - y0) < 0) {
      wn--;
    }
  }
  return wn !== 0;
}

function lerp(a, b, t) {
  return Math.round(a + (b - a) * t);
}

// --- PNG encoding ----------------------------------------------------------

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
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function renderPng(size) {
  const scale = (size * (1 - 2 * PADDING)) / 24;
  const offset = size * PADDING;
  const edges = buildEdges(scale, offset);
  const SS = 4; // supersampling per axis, for anti-aliased edges

  const stride = size * 4 + 1;
  const raw = Buffer.alloc(stride * size);

  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      let hits = 0;
      for (let j = 0; j < SS; j++) {
        for (let i = 0; i < SS; i++) {
          if (inside(x + (i + 0.5) / SS, y + (j + 0.5) / SS, edges)) hits++;
        }
      }
      const o = y * stride + 1 + x * 4;
      if (hits === 0) {
        raw[o] = raw[o + 1] = raw[o + 2] = raw[o + 3] = 0;
        continue;
      }
      const t = Math.min(1, (x + y) / (2 * (size - 1))); // diagonal gradient
      raw[o] = lerp(BLUE[0], TEAL[0], t);
      raw[o + 1] = lerp(BLUE[1], TEAL[1], t);
      raw[o + 2] = lerp(BLUE[2], TEAL[2], t);
      raw[o + 3] = Math.round((255 * hits) / (SS * SS));
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const dir = new URL('../src/icons/', import.meta.url);
await mkdir(dir, { recursive: true });
for (const size of [16, 48, 128]) {
  await writeFile(new URL(`icon${size}.png`, dir), renderPng(size));
  console.log(`wrote src/icons/icon${size}.png`);
}
