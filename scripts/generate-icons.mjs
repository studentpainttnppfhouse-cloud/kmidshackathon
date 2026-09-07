/**
 * Builds every icon the portal ships, from one shape defined here.
 *
 * Run it after changing the mark or the brand pink:
 *
 *   node scripts/generate-icons.mjs
 *
 * It writes public/icon.svg, public/favicon.ico and the PNGs the manifest and
 * iOS need. Nothing outside this file describes the artwork, so the tab icon,
 * the installed-app icon and the sidebar logo can never drift apart.
 *
 * There is no image library involved on purpose: the project's only
 * dependencies are the ones the app itself runs on, and a favicon is not worth
 * adding a native build step for. The rasteriser below is a few dozen lines of
 * scanline fill, which is all a flat two-colour mark needs.
 */

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

// --- The artwork --------------------------------------------------------
// One 64x64 grid. The heart matches the one in src/components/brand.tsx.

const BOX = 64;
const RADIUS = 14; // corner radius of the tile, in grid units
const TOP = "#F472B6"; // brand pink, light end of the sweep
const BOTTOM = "#BE185D"; // brand deep, dark end

/** The mark, as SVG path data on the 64x64 grid. */
export const HEART_PATH =
  "M32 48C20.5 39.5 12 32.5 12 25.5C12 19.5 16.8 15.5 22.4 15.5" +
  "C26.6 15.5 30.2 18 32 21.4C33.8 18 37.4 15.5 41.6 15.5" +
  "C47.2 15.5 52 19.5 52 25.5C52 32.5 43.5 39.5 32 48Z";

// The same curves as a list of cubic segments, for the rasteriser. Each entry
// is [x1, y1, x2, y2, x, y] continuing from the previous point.
const HEART_START = [32, 48];
const HEART_CURVES = [
  [20.5, 39.5, 12, 32.5, 12, 25.5],
  [12, 19.5, 16.8, 15.5, 22.4, 15.5],
  [26.6, 15.5, 30.2, 18, 32, 21.4],
  [33.8, 18, 37.4, 15.5, 41.6, 15.5],
  [47.2, 15.5, 52, 19.5, 52, 25.5],
  [52, 32.5, 43.5, 39.5, 32, 48],
];

function heartPolygon() {
  const points = [HEART_START];
  let [px, py] = HEART_START;
  for (const [x1, y1, x2, y2, x, y] of HEART_CURVES) {
    const STEPS = 48;
    for (let i = 1; i <= STEPS; i++) {
      const t = i / STEPS;
      const u = 1 - t;
      points.push([
        u * u * u * px + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x,
        u * u * u * py + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y,
      ]);
    }
    [px, py] = [x, y];
  }
  return points;
}

function roundedRectPolygon(radius) {
  if (radius <= 0) {
    return [
      [0, 0],
      [BOX, 0],
      [BOX, BOX],
      [0, BOX],
    ];
  }
  const points = [];
  const corners = [
    [BOX - radius, BOX - radius, 0],
    [radius, BOX - radius, 90],
    [radius, radius, 180],
    [BOX - radius, radius, 270],
  ];
  for (const [cx, cy, start] of corners) {
    for (let i = 0; i <= 16; i++) {
      const angle = ((start + (i / 16) * 90) * Math.PI) / 180;
      points.push([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)]);
    }
  }
  return points;
}

// --- Rasteriser ---------------------------------------------------------

/**
 * Per-pixel coverage of a closed polygon, 0..1, by sampling `SUB` scanlines per
 * pixel row and measuring the covered width of each span. Vertical edges are
 * exact, horizontal ones get `SUB` steps of anti-aliasing, which at 16px is
 * already past what the eye can pick out.
 */
function coverage(polygon, size) {
  const SUB = 8;
  const scale = size / BOX;
  const pts = polygon.map(([x, y]) => [x * scale, y * scale]);
  const cov = new Float32Array(size * size);

  for (let row = 0; row < size; row++) {
    for (let s = 0; s < SUB; s++) {
      const y = row + (s + 0.5) / SUB;
      const crossings = [];
      for (let i = 0; i < pts.length; i++) {
        const [x1, y1] = pts[i];
        const [x2, y2] = pts[(i + 1) % pts.length];
        if (y1 === y2) continue;
        if (y >= Math.min(y1, y2) && y < Math.max(y1, y2)) {
          crossings.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
        }
      }
      crossings.sort((a, b) => a - b);
      for (let i = 0; i + 1 < crossings.length; i += 2) {
        const from = crossings[i];
        const to = crossings[i + 1];
        for (let col = Math.max(0, Math.floor(from)); col < Math.min(size, Math.ceil(to)); col++) {
          const covered = Math.min(to, col + 1) - Math.max(from, col);
          if (covered > 0) cov[row * size + col] += covered / SUB;
        }
      }
    }
  }
  return cov;
}

const hex = (value) => [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16));

/** RGBA pixels for one icon. `radius` of 0 renders full-bleed, for iOS. */
function render(size, radius) {
  const tile = coverage(roundedRectPolygon(radius), size);
  const mark = coverage(heartPolygon(), size);
  const top = hex(TOP);
  const bottom = hex(BOTTOM);
  const pixels = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      // Diagonal sweep, so the tile reads as lit from the top left.
      const t = Math.min(1, Math.max(0, (x + y) / (2 * (size - 1))));
      const alpha = Math.min(1, tile[i]);
      const white = Math.min(1, mark[i]);
      for (let c = 0; c < 3; c++) {
        const base = top[c] + (bottom[c] - top[c]) * t;
        pixels[i * 4 + c] = Math.round(base + (255 - base) * white);
      }
      pixels[i * 4 + 3] = Math.round(alpha * 255);
    }
  }
  return pixels;
}

// --- PNG ----------------------------------------------------------------

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function png(size, pixels) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // truecolour with alpha
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** ICO carrying PNG payloads, which every browser still in use can read. */
function ico(sizes) {
  const images = sizes.map((size) => png(size, render(size, RADIUS)));
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(sizes.length, 4);

  let offset = 6 + sizes.length * 16;
  const entries = sizes.map((size, i) => {
    const entry = Buffer.alloc(16);
    entry[0] = size >= 256 ? 0 : size;
    entry[1] = size >= 256 ? 0 : size;
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(images[i].length, 8); // payload size
    entry.writeUInt32LE(offset, 12);
    offset += images[i].length;
    return entry;
  });

  return Buffer.concat([header, ...entries, ...images]);
}

// --- SVG ----------------------------------------------------------------

function svg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BOX} ${BOX}">
  <defs>
    <linearGradient id="tile" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${TOP}"/>
      <stop offset="1" stop-color="${BOTTOM}"/>
    </linearGradient>
  </defs>
  <rect width="${BOX}" height="${BOX}" rx="${RADIUS}" fill="url(#tile)"/>
  <path d="${HEART_PATH}" fill="#fff"/>
</svg>
`;
}

// --- Write --------------------------------------------------------------

const files = [
  ["icon.svg", Buffer.from(svg(), "utf8")],
  ["favicon.ico", ico([16, 32, 48])],
  // Rounded, for anywhere the icon is shown as-is.
  ["icon-192.png", png(192, render(192, RADIUS))],
  ["icon-512.png", png(512, render(512, RADIUS))],
  // Square, for the two places the platform applies its own mask and a second
  // rounded corner inside the first looks like a mistake.
  ["apple-icon.png", png(180, render(180, 0))],
  ["icon-maskable-512.png", png(512, render(512, 0))],
];

mkdirSync(OUT, { recursive: true });
for (const [name, data] of files) {
  writeFileSync(join(OUT, name), data);
  console.log(`${name.padEnd(24)} ${data.length.toLocaleString()} bytes`);
}
