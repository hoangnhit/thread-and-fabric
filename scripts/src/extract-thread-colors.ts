import sharp from "sharp";
import { writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const IMAGE_PATH = resolve(__dirname, "../../attached_assets/image_1773804485155.png");
const OUTPUT_PATH = resolve(__dirname, "../../artifacts/thread-color/src/data/threads-extracted.json");

const rowData: Record<string, string[]> = {
  O: ["G578","G668","G904","G879","G851","G979","G750","G703","G985","G970","G902","G903","G690","G704","G891","G677","G669","G996","G798","G705"],
  N: ["G920","G552","G809","G684","G939","G568","G956","G706","G759","G790","G793","G757","G569","G969","G796","G756","G794","G967","G795","G905"],
  M: ["G541","G940","G748","G702","G900","G768","G648","G848","G968","G769","G770","G649","G620","G701","G749","G988","G650","G651","9091","00555"],
  L: ["G647","G845","9141","G645","G847","G746","G799","G888","G846","G685","G991","G890","9102","G652","G868","G989","G849","G751","G580","G780"],
  K: ["G692","9138","G594","G892","G932","G827","G893","9052","G694","G593","G895","G852","G977","G695","G677","G797","5801","G992","G896","G762"],
};

const SWATCH_X_START = 0.28;
const SWATCH_X_END = 0.90;
const NUM_SWATCHES = 20;

function toHex(r: number, g: number, b: number): string {
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
}

function getSaturation(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === 0) return 0;
  return (max - min) / max;
}

async function extractColors() {
  // Use .rotate() to auto-apply EXIF orientation
  const image = sharp(IMAGE_PATH).rotate();
  const meta = await image.metadata();
  const { width = 1280, height = 960 } = meta;

  console.log(`Image dimensions (after EXIF rotation): ${width}x${height}`);

  const { data } = await image.raw().toBuffer({ resolveWithObject: true });
  const channels = 3;

  function getPixel(x: number, y: number): [number, number, number] {
    const xi = Math.floor(Math.max(0, Math.min(x, width - 1)));
    const yi = Math.floor(Math.max(0, Math.min(y, height - 1)));
    const offset = (yi * width + xi) * channels;
    return [data[offset], data[offset + 1], data[offset + 2]];
  }

  function sampleArea(cx: number, cy: number, radius = 12): [number, number, number] {
    let r = 0, g = 0, b = 0, count = 0;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx*dx + dy*dy <= radius*radius) {
          const [pr, pg, pb] = getPixel(cx + dx, cy + dy);
          r += pr; g += pg; b += pb;
          count++;
        }
      }
    }
    return [Math.round(r/count), Math.round(g/count), Math.round(b/count)];
  }

  // Scan vertically at middle X to auto-detect row centers
  // Look for regions with high saturation (actual thread color, not white background)
  const scanX = Math.floor(width * 0.55); // middle of swatch area
  console.log(`\nScanning vertically at x=${scanX} to find row centers...`);

  const satProfile: number[] = [];
  for (let y = 0; y < height; y++) {
    const [r, g, b] = getPixel(scanX, y);
    satProfile.push(getSaturation(r, g, b));
  }

  // Find peaks of saturation (row centers) using a sliding window
  const WINDOW = 20;
  const smoothSat: number[] = satProfile.map((_, i) => {
    const slice = satProfile.slice(Math.max(0, i - WINDOW), Math.min(height, i + WINDOW));
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });

  // Find local maxima above threshold
  const SAT_THRESHOLD = 0.08;
  const MIN_ROW_SPACING = 80;
  const peaks: number[] = [];

  for (let y = WINDOW; y < height - WINDOW; y++) {
    if (smoothSat[y] > SAT_THRESHOLD) {
      // Check if this is a local max
      let isMax = true;
      for (let dy = -30; dy <= 30; dy++) {
        if (dy !== 0 && y + dy >= 0 && y + dy < height && smoothSat[y + dy] > smoothSat[y]) {
          isMax = false;
          break;
        }
      }
      if (isMax && (peaks.length === 0 || y - peaks[peaks.length - 1] > MIN_ROW_SPACING)) {
        peaks.push(y);
      }
    }
  }

  console.log(`Found ${peaks.length} row peaks at y positions: ${peaks.join(', ')}`);

  const rowOrder = ["O", "N", "M", "L", "K"];
  const rowCentersY: Record<string, number> = {};

  if (peaks.length >= 5) {
    // Use detected peaks
    for (let i = 0; i < 5; i++) {
      rowCentersY[rowOrder[i]] = peaks[i];
    }
  } else {
    // Fallback to estimated positions
    console.log("Using fallback Y positions...");
    rowCentersY.O = Math.floor(height * 0.22);
    rowCentersY.N = Math.floor(height * 0.38);
    rowCentersY.M = Math.floor(height * 0.53);
    rowCentersY.L = Math.floor(height * 0.69);
    rowCentersY.K = Math.floor(height * 0.85);
  }

  // Print detected positions with their colors at scanX
  for (const [row, cy] of Object.entries(rowCentersY)) {
    const [r, g, b] = sampleArea(scanX, cy, 5);
    console.log(`Row ${row} center y=${cy} → ${toHex(r,g,b)} rgb(${r},${g},${b}) sat=${getSaturation(r,g,b).toFixed(3)}`);
  }

  // Scan X to find where the rightmost CONTINUOUS swatch band ends
  // (before the "100% Polyester" label on the right side)
  const mY = rowCentersY.M ?? Math.floor(height * 0.53);
  let firstColoredX = -1;
  let lastColoredX = -1;
  // Find first colored pixel (going left to right)
  for (let x = 0; x < width; x++) {
    const [r, g, b] = getPixel(x, mY);
    if (getSaturation(r, g, b) > 0.15) { firstColoredX = x; break; }
  }
  // Find last continuous colored region (going right to left), ignore small gaps
  let gapCount = 0;
  for (let x = width - 1; x >= 0; x--) {
    const [r, g, b] = getPixel(x, mY);
    if (getSaturation(r, g, b) > 0.15) {
      lastColoredX = x; gapCount = 0;
    } else {
      gapCount++;
      if (gapCount > 60 && lastColoredX > 0) break; // Found end of swatch area
    }
  }
  console.log(`\nX range of swatches at Row M: ${firstColoredX} to ${lastColoredX}`);
  const xStart = firstColoredX > 0 ? firstColoredX / width : SWATCH_X_START;
  const xEnd = lastColoredX > 0 ? Math.min(lastColoredX / width, 0.89) : SWATCH_X_END;
  console.log(`Normalized: ${xStart.toFixed(3)} to ${xEnd.toFixed(3)}`);

  // Now extract colors
  const results: Array<{ code: string; row: string; hex: string }> = [];

  for (const [row, codes] of Object.entries(rowData)) {
    const cy = rowCentersY[row] ?? Math.floor(height * 0.5);
    for (let i = 0; i < codes.length; i++) {
      const t = (i + 0.5) / NUM_SWATCHES;
      const cx = Math.floor((xStart + t * (xEnd - xStart)) * width);
      const [r, g, b] = sampleArea(cx, cy, 12);
      const hex = toHex(r, g, b);
      results.push({ code: codes[i], row, hex });
      console.log(`${row} ${codes[i]}: (${cx},${cy}) → ${hex}`);
    }
  }

  writeFileSync(OUTPUT_PATH, JSON.stringify(results, null, 2));
  console.log(`\nExtracted ${results.length} colors → ${OUTPUT_PATH}`);
}

extractColors().catch(console.error);
