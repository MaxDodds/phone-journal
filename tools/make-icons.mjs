// Renders the app icon (a cream ring with an ember "record" dot) to PNG without dependencies.
// Usage: node tools/make-icons.mjs
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'icons');

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePng(size, rgb) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2; // truecolor RGB
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    rgb.copy(raw, y * (size * 3 + 1) + 1, y * size * 3, (y + 1) * size * 3);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const hex = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

const TOP = hex('#22201d');
const BOTTOM = hex('#0d0c0b');
const RING = hex('#efe8dd');
const DOT = hex('#e6a066');
const GLOW = hex('#e6a066');

function render(size) {
  const rgb = Buffer.alloc(size * size * 3);
  const SS = 4;
  const c = 0.5;
  const ringR = 0.285;
  const ringW = 0.034;
  const dotR = 0.105;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const acc = [0, 0, 0];
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = (x + (sx + 0.5) / SS) / size;
          const v = (y + (sy + 0.5) / SS) / size;
          const d = Math.hypot(u - c, v - c);
          let col = mix(TOP, BOTTOM, v);
          col = mix(col, GLOW, Math.max(0, 0.16 * (1 - d / 0.42)) ** 1.4);
          if (Math.abs(d - ringR) < ringW / 2) col = RING;
          if (d < dotR) col = DOT;
          acc[0] += col[0];
          acc[1] += col[1];
          acc[2] += col[2];
        }
      }
      const o = (y * size + x) * 3;
      for (let i = 0; i < 3; i++) rgb[o + i] = Math.round(acc[i] / (SS * SS));
    }
  }
  return encodePng(size, rgb);
}

fs.mkdirSync(OUT, { recursive: true });
for (const size of [180, 192, 512]) {
  fs.writeFileSync(path.join(OUT, `icon-${size}.png`), render(size));
  console.log(`icons/icon-${size}.png`);
}
