// Generate the app icon source PNG (1024×1024) and the tray template (32px)
// with zero dependencies: the official brand mark is rasterized here from
// `src-tauri/icons/dsh-mark.svg` (the DeepSeek Harness whale, vendored from
// upstream's Web UI favicon) by a scanline filler plus a hand-rolled PNG
// encoder (zlib.deflateSync + CRC32).
//
// Design: the official mark in white on a dark rounded square, so the app icon
// is the product's own identity rather than a house-drawn substitute.
// Run `pnpm icons` afterwards to derive the full platform set (ico/icns/pngs)
// via `tauri icon`.

import { deflateSync } from "node:zlib";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ICONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "src-tauri", "icons");
/** The vendored official mark; the single source of truth for both outputs. */
const MARK_SVG = join(ICONS_DIR, "dsh-mark.svg");

const SIZE = 1024;
const RADIUS = 220; // rounded corner radius

const BG: [number, number, number] = [0x0d, 0x11, 0x17];
const MARK: [number, number, number] = [0xff, 0xff, 0xff];

// --- minimal PNG encoder -------------------------------------------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(rgba: Buffer, size: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// --- brand mark: parse, flatten, scale ------------------------------------
type Point = readonly [number, number];

/** Segments per cubic; the mark's curves are gentle and 1024px is the target. */
const CURVE_STEPS = 24;

/** Parse the subset of SVG path syntax the vendored mark uses: M / C / Z. */
function parseMark(d: string): Point[][] {
  const tokens = d.match(/[MCZ]|-?\d*\.?\d+(?:[eE][-+]?\d+)?/g) ?? [];
  const subpaths: Point[][] = [];
  let current: Point[] = [];
  let x = 0;
  let y = 0;
  let i = 0;
  const next = (): number => Number(tokens[i++]);

  const flush = (): void => {
    if (current.length > 2) subpaths.push(current);
    current = [];
  };

  while (i < tokens.length) {
    const cmd = tokens[i++];
    if (cmd === "M") {
      flush();
      x = next();
      y = next();
      current.push([x, y]);
    } else if (cmd === "C") {
      const x1 = next();
      const y1 = next();
      const x2 = next();
      const y2 = next();
      const x3 = next();
      const y3 = next();
      for (let step = 1; step <= CURVE_STEPS; step++) {
        const t = step / CURVE_STEPS;
        const u = 1 - t;
        const a = u * u * u;
        const b = 3 * u * u * t;
        const c = 3 * u * t * t;
        const e = t * t * t;
        current.push([
          a * x + b * x1 + c * x2 + e * x3,
          a * y + b * y1 + c * y2 + e * y3,
        ]);
      }
      x = x3;
      y = y3;
    } else if (cmd === "Z") {
      flush();
    }
  }
  flush();
  return subpaths;
}

/** Read the vendored SVG and flatten its one path into closed polygons. */
function loadMarkPolygons(): Point[][] {
  const svg = readFileSync(MARK_SVG, "utf8");
  const match = /<path\b[^>]*\sd="([^"]+)"/.exec(svg);
  if (match === null) throw new Error(`no <path d="..."> found in ${MARK_SVG}`);
  return parseMark(match[1]);
}

/** Scale + centre polygons so the glyph's longest side spans `fraction`. */
function fitPolygons(polygons: Point[][], size: number, fraction: number): Point[][] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const polygon of polygons) {
    for (const [px, py] of polygon) {
      if (px < minX) minX = px;
      if (py < minY) minY = py;
      if (px > maxX) maxX = px;
      if (py > maxY) maxY = py;
    }
  }
  const span = Math.max(maxX - minX, maxY - minY);
  const scale = (size * fraction) / span;
  const offsetX = (size - (maxX - minX) * scale) / 2 - minX * scale;
  const offsetY = (size - (maxY - minY) * scale) / 2 - minY * scale;
  return polygons.map((polygon) =>
    polygon.map(([px, py]): Point => [px * scale + offsetX, py * scale + offsetY]),
  );
}

// --- scanline nonzero fill with analytic x coverage -----------------------
/**
 * Coverage per pixel (0..1) of the nonzero-filled polygons, anti-aliased in
 * both axes: `SUB_ROWS` analytic scanlines per pixel row, and exact x overlap
 * inside each row.
 */
function fillCoverage(polygons: Point[][], size: number, subRows: number): Float32Array {
  const coverage = new Float32Array(size * size);
  const crossings: { x: number; dir: number }[] = [];

  const addSpan = (row: number, from: number, to: number): void => {
    const start = Math.max(0, Math.floor(from));
    const end = Math.min(size - 1, Math.ceil(to) - 1);
    const base = row * size;
    for (let px = start; px <= end; px++) {
      const overlap = Math.min(to, px + 1) - Math.max(from, px);
      if (overlap > 0) coverage[base + px] += overlap / subRows;
    }
  };

  for (let py = 0; py < size; py++) {
    for (let sub = 0; sub < subRows; sub++) {
      const y = py + (sub + 0.5) / subRows;
      crossings.length = 0;
      for (const polygon of polygons) {
        for (let i = 0; i < polygon.length; i++) {
          const [ax, ay] = polygon[i];
          const [bx, by] = polygon[(i + 1) % polygon.length];
          if ((ay <= y && by > y) || (by <= y && ay > y)) {
            const t = (y - ay) / (by - ay);
            crossings.push({ x: ax + t * (bx - ax), dir: by > ay ? 1 : -1 });
          }
        }
      }
      if (crossings.length < 2) continue;
      crossings.sort((a, b) => a.x - b.x);
      let winding = 0;
      let spanStart = 0;
      for (const crossing of crossings) {
        const before = winding;
        winding += crossing.dir;
        if (before === 0 && winding !== 0) spanStart = crossing.x;
        else if (before !== 0 && winding === 0 && crossing.x > spanStart) addSpan(py, spanStart, crossing.x);
      }
    }
  }
  return coverage;
}

// --- drawing --------------------------------------------------------------
function inRoundedRect(x: number, y: number, size: number, radius: number): boolean {
  const cx = Math.min(Math.max(x, radius), size - 1 - radius);
  const cy = Math.min(Math.max(y, radius), size - 1 - radius);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= radius * radius;
}

const polygons = loadMarkPolygons();

// ---------------------------------------------------------------------------
// App icon: official mark in white on the dark rounded square.
// ---------------------------------------------------------------------------
const fitted = fitPolygons(polygons, SIZE, 0.62);
const coverage = fillCoverage(fitted, SIZE, 4);
const rgba = Buffer.alloc(SIZE * SIZE * 4);
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    // 2×2 supersampling for the rounded-square alpha.
    let hits = 0;
    for (const [ox, oy] of [
      [0.25, 0.25],
      [0.75, 0.25],
      [0.25, 0.75],
      [0.75, 0.75],
    ]) {
      if (inRoundedRect(x + ox, y + oy, SIZE, RADIUS)) hits++;
    }
    const i = (y * SIZE + x) * 4;
    const glyph = Math.min(1, coverage[y * SIZE + x]);
    rgba[i] = Math.round(BG[0] * (1 - glyph) + MARK[0] * glyph);
    rgba[i + 1] = Math.round(BG[1] * (1 - glyph) + MARK[1] * glyph);
    rgba[i + 2] = Math.round(BG[2] * (1 - glyph) + MARK[2] * glyph);
    rgba[i + 3] = Math.round((hits / 4) * 255);
  }
}

const outPath = join(ICONS_DIR, "icon-source.png");
mkdirSync(ICONS_DIR, { recursive: true });
writeFileSync(outPath, encodePng(rgba, SIZE));
console.log(`✓ icon source written → ${outPath}`);

// ---------------------------------------------------------------------------
// Tray template icon (32px, monochrome black mark, transparent background).
// macOS uses template images (auto light/dark); Windows/Linux tint per theme.
// ---------------------------------------------------------------------------
function genTrayTemplate(): void {
  const S = 32;
  const trayCoverage = fillCoverage(fitPolygons(polygons, S, 0.86), S, 4);
  const tray = Buffer.alloc(S * S * 4);
  for (let i = 0; i < S * S; i++) {
    tray[i * 4] = 0;
    tray[i * 4 + 1] = 0;
    tray[i * 4 + 2] = 0;
    tray[i * 4 + 3] = Math.round(Math.min(1, trayCoverage[i]) * 255);
  }
  const trayPath = join(ICONS_DIR, "tray-template.png");
  writeFileSync(trayPath, encodePng(tray, S));
  console.log(`✓ tray template icon written → ${trayPath}`);
}

genTrayTemplate();
