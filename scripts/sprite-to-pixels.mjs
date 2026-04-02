#!/usr/bin/env node
/**
 * Convert a PNG sprite to the slides {pixels} format.
 * Uses pngjs to read pixel data directly — no macOS dependencies.
 *
 * Usage: node scripts/sprite-to-pixels.mjs <input.png> [--scale=N]
 */
import fs from 'fs';
import path from 'path';
import { PNG } from 'pngjs';

const inputFile = process.argv[2];
if (!inputFile) {
  console.error('Usage: node scripts/sprite-to-pixels.mjs <input.png> [--scale=N]');
  process.exit(1);
}

const scaleArg = process.argv.find(a => a.startsWith('--scale='));
const scale = scaleArg ? parseInt(scaleArg.split('=')[1]) : 1;

const absInput = path.resolve(inputFile);
const data = fs.readFileSync(absInput);
const png = PNG.sync.read(data);
const { width, height } = png;

console.error(`Image: ${width}x${height}`);

function mapColor(r, g, b, a) {
  if (a < 128) return '.';
  if (r > 230 && g > 230 && b > 230) return '.';
  if (r < 30 && g < 30 && b < 30) return 'K';

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const brightness = (r + g + b) / 3;

  if (delta < 30) {
    if (brightness > 200) return '8';
    if (brightness > 160) return '6';
    if (brightness > 120) return '5';
    if (brightness > 80) return '3';
    if (brightness > 40) return '2';
    return '1';
  }

  let hue = 0;
  if (max === r) hue = 60 * (((g - b) / delta) % 6);
  else if (max === g) hue = 60 * ((b - r) / delta + 2);
  else hue = 60 * ((r - g) / delta + 4);
  if (hue < 0) hue += 360;

  // Brown/tan (Eevee, earth tones)
  if (hue >= 20 && hue <= 50) {
    if (brightness > 180) return 'Y';
    if (brightness > 120) return 'O';
    return '5';
  }

  if (hue >= 10 && hue <= 20) return 'O';
  if (hue < 15 || hue >= 345) return 'R';
  if (hue >= 45 && hue < 70) return 'Y';
  if (hue >= 70 && hue < 170) return 'G';
  if (hue >= 170 && hue < 200) return 'C';
  if (hue >= 200 && hue < 260) return 'B';
  if (hue >= 260 && hue < 345) return 'M';

  return '5';
}

// Read all pixels
const grid = [];
for (let y = 0; y < height; y++) {
  let row = '';
  for (let x = 0; x < width; x++) {
    const idx = (y * width + x) * 4;
    const r = png.data[idx];
    const g = png.data[idx + 1];
    const b = png.data[idx + 2];
    const a = png.data[idx + 3];
    const ch = mapColor(r, g, b, a);
    row += ch.repeat(scale);
  }
  for (let s = 0; s < scale; s++) {
    grid.push(row);
  }
}

// Trim empty rows
let top = 0, bottom = grid.length - 1;
while (top < grid.length && grid[top].replace(/\./g, '') === '') top++;
while (bottom > top && grid[bottom].replace(/\./g, '') === '') bottom--;
const trimmed = grid.slice(top, bottom + 1);

// Find left/right content bounds
let left = Infinity, right = 0;
for (const row of trimmed) {
  for (let i = 0; i < row.length; i++) {
    if (row[i] !== '.') { left = Math.min(left, i); right = Math.max(right, i); }
  }
}

const result = trimmed.map(r => r.slice(left, right + 1));

// Output as pixels block
console.log('```pixels');
result.forEach(r => console.log(r));
console.log('```');
