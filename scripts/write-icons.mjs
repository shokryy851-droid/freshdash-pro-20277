// Generates the PWA icons (192/512 PNG) procedurally at build time:
// brand-green rounded tile, white leaf, golden sun. No binary files in git, no dependencies.
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const GREEN_TOP = [46, 125, 50]; // #2e7d32
const GREEN_BOTTOM = [20, 74, 25]; // #144a19
const WHITE = [255, 255, 255];
const GOLD = [244, 194, 77]; // #f4c24d
const VEIN = [27, 94, 32]; // #1b5e20

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** Colour of a point in unit space (0..1); null = transparent. Maskable-safe: art stays in the centre 70%. */
function shade(u, v) {
  // Rounded-square tile (radius 22%)
  const r = 0.22;
  const dx = Math.max(Math.abs(u - 0.5) - (0.5 - r), 0);
  const dy = Math.max(Math.abs(v - 0.5) - (0.5 - r), 0);
  if (dx * dx + dy * dy > r * r) return null;

  // Sun (top-right)
  const sx = u - 0.68, sy = v - 0.32;
  if (sx * sx + sy * sy < 0.0115) return GOLD;

  // Leaf: intersection of two circles, rotated 45°, centred slightly low-left
  const cx = u - 0.46, cy = v - 0.56;
  const a = (cx + cy) * Math.SQRT1_2; // along leaf axis
  const b = (cy - cx) * Math.SQRT1_2; // across leaf axis
  const R = 0.3, off = 0.19;
  const inLeaf = a * a + (b - off) * (b - off) < R * R && a * a + (b + off) * (b + off) < R * R;
  if (inLeaf) {
    if (Math.abs(b) < 0.012 && Math.abs(a) < 0.2) return VEIN; // midrib
    return WHITE;
  }
  // Stem
  if (Math.abs(b) < 0.014 && a > 0.2 && a < 0.29) return WHITE;

  const t = v;
  return GREEN_TOP.map((c, i) => Math.round(c + (GREEN_BOTTOM[i] - c) * t));
}

function encode(size) {
  const SS = 4; // 4x4 supersampling for smooth edges
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, alpha = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = shade((x + (sx + 0.5) / SS) / size, (y + (sy + 0.5) / SS) / size);
          if (!c) continue;
          r += c[0]; g += c[1]; b += c[2]; alpha++;
        }
      }
      const o = row + 1 + x * 4;
      if (alpha) {
        raw[o] = Math.round(r / alpha);
        raw[o + 1] = Math.round(g / alpha);
        raw[o + 2] = Math.round(b / alpha);
      }
      raw[o + 3] = Math.round((alpha / (SS * SS)) * 255);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

const outDir = new URL('../public/icons/', import.meta.url);
mkdirSync(outDir, { recursive: true });
for (const size of [192, 512]) writeFileSync(new URL(`icon-${size}.png`, outDir), encode(size));
console.log('[icons] generated 192 & 512');
