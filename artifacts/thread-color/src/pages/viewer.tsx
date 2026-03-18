import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useLocation } from "wouter";

/* ─── TYPES ─────────────────────────────────────────────────────── */
type StitchType = "STITCH" | "JUMP" | "TRIM" | "COLOR_CHANGE" | "END";
interface Stitch { x: number; y: number; type: StitchType; colorIndex: number; }
interface ParsedDesign {
  stitches: Stitch[];
  colorCount: number;
  palette: string[];
  width: number; height: number;
  stitchCount: number;
  format: "DST" | "PES" | "PEC" | "JEF" | "EXP";
  label: string;
}

/* ─── PEC COLOR TABLE  (exact RGB from leomurca/embroidery-viewer) ── */
const PEC_PALETTE: string[] = [
  "#000000","#0E1F7C","#0A55A3","#008777","#4B6BAF","#ED171F","#D15C00",
  "#913697","#E49ACB","#915FAC","#9ED67D","#E8A900","#FEBA35","#FFFF00",
  "#70BC1F","#BA9800","#A8A8A8","#7D6F00","#FFFFB3","#4F5556","#000000",
  "#0B3D91","#770176","#293133","#2A1301","#F64A8A","#B27624","#FCBBC5",
  "#FE370F","#F0F0F0","#6A1C8A","#A8DDC4","#2584BB","#FEB343","#FFF36B",
  "#D0A660","#D15400","#66BA49","#134A46","#878787","#D8CCC6","#435607",
  "#FDD9DE","#F993BC","#003822","#B2AFD4","#686AB0","#EFE3B9","#F73866",
  "#B54B64","#132B1A","#C70156","#FE9E32","#A8DEEB","#00673E","#4E2990",
  "#2F7E20","#FFCCCC","#FFD911","#095BA6","#F0F970","#E3F35B","#FF9900",
  "#FFF08D","#FFC8C8",
];

/* ─── FILE-VIEW HELPER (sequential seek/read over ArrayBuffer) ───── */
class EmbFile {
  private dv: DataView;
  private p = 0;
  byteLength: number;
  constructor(buf: ArrayBuffer) { this.dv = new DataView(buf); this.byteLength = buf.byteLength; }
  tell() { return this.p; }
  seek(pos: number) { this.p = pos; }
  getUint8(): number { return this.dv.getUint8(this.p++); }
  getInt8(): number { return this.dv.getInt8(this.p++); }
  getInt32(pos: number, le = true): number { const v = this.dv.getInt32(pos, le); this.p = pos + 4; return v; }
  getUint32(pos: number, le = true): number { const v = this.dv.getUint32(pos, le); this.p = pos + 4; return v; }
  getString(pos: number, maxLen: number): string {
    let s = "";
    for (let i = 0; i < maxLen && pos + i < this.byteLength; i++) {
      const c = this.dv.getUint8(pos + i);
      if (c === 0 || c === 0xFF || c === 0x0D || c === 0x0A) break;
      s += String.fromCharCode(c);
    }
    return s.trim();
  }
}

/* ─── PEC STITCH COORDINATE DECODE (reference-accurate) ─────────── */
function pecDecodeXY(file: EmbFile, x: number, y: number): [number, number] {
  if (x & 0x80) {
    x = ((x & 0x0f) << 8) + y;
    if (x & 0x800) x -= 0x1000;
    y = file.getUint8();
  } else if (x >= 0x40) {
    x -= 0x80;
  }
  if (y & 0x80) {
    y = ((y & 0x0f) << 8) + file.getUint8();
    if (y & 0x800) y -= 0x1000;
  } else if (y > 0x3f) {
    y -= 0x80;
  }
  return [x, y];
}

/* shared bounds tracker */
interface Bounds { minX:number; maxX:number; minY:number; maxY:number; }
function updateBounds(b: Bounds, x: number, y: number) {
  if (x < b.minX) b.minX = x; if (x > b.maxX) b.maxX = x;
  if (y < b.minY) b.minY = y; if (y > b.maxY) b.maxY = y;
}

/* ─── PEC STITCH LOOP (used by PES, PEC, JEF via pec stitch section) */
function readPecStitches(
  file: EmbFile, stitches: Stitch[], palette: string[],
  colorIndex: { v: number }, bounds: Bounds
) {
  let cx = 0, cy = 0;
  while (file.tell() < file.byteLength - 1) {
    let x = file.getUint8(), y = file.getUint8();
    if (x === 0xFF && y === 0x00) { break; }
    if (x === 0xFE && y === 0xB0) {
      file.getUint8();
      stitches.push({ x: cx, y: cy, type: "COLOR_CHANGE", colorIndex: colorIndex.v });
      colorIndex.v++;
      continue;
    }
    let type: StitchType = "STITCH";
    if (x & 0x80) {
      if (x & 0x20) type = "TRIM"; else if (x & 0x10) type = "JUMP";
    } else if (y & 0x80) {
      if (y & 0x20) type = "TRIM"; else if (y & 0x10) type = "JUMP";
    }
    [x, y] = pecDecodeXY(file, x, y);
    cx += x; cy += y;
    stitches.push({ x: cx, y: cy, type, colorIndex: colorIndex.v });
    if (type === "STITCH") updateBounds(bounds, cx, cy);
  }
}

/* ─── DST PARSER (fixed bit assignments per reference) ──────────── */
function parseDST(buf: ArrayBuffer): ParsedDesign {
  const file = new EmbFile(buf);
  const label = file.getString(0, 511).includes("LA:")
    ? file.getString(file.getString(0, 511).indexOf("LA:") + 3, 16) || "DST Design"
    : "DST Design";
  const stitches: Stitch[] = [];
  const bounds: Bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  let cx = 0, cy = 0, colorIndex = 0;
  file.seek(512);
  while (file.tell() < file.byteLength - 2) {
    const b0 = file.getUint8(), b1 = file.getUint8(), b2 = file.getUint8();
    if (b2 === 0xF3) break;
    let dx = 0, dy = 0;
    // b0: X±1,±9  Y±1,±9
    if (b0 & 0x01) dx += 1; if (b0 & 0x02) dx -= 1;
    if (b0 & 0x04) dx += 9; if (b0 & 0x08) dx -= 9;
    if (b0 & 0x80) dy += 1; if (b0 & 0x40) dy -= 1;
    if (b0 & 0x20) dy += 9; if (b0 & 0x10) dy -= 9;
    // b1: X±3,±27  Y±3,±27
    if (b1 & 0x01) dx += 3; if (b1 & 0x02) dx -= 3;
    if (b1 & 0x04) dx += 27; if (b1 & 0x08) dx -= 27;
    if (b1 & 0x80) dy += 3; if (b1 & 0x40) dy -= 3;
    if (b1 & 0x20) dy += 27; if (b1 & 0x10) dy -= 27;
    // b2: X±81  Y±81  command
    if (b2 & 0x04) dx += 81; if (b2 & 0x08) dx -= 81;
    if (b2 & 0x20) dy += 81; if (b2 & 0x10) dy -= 81;
    const isTrim = (b2 & 0x80) !== 0;
    const isStop = (b2 & 0x40) !== 0;
    cx += dx; cy -= dy; // invert Y (DST is Y-up)
    if (isStop) {
      stitches.push({ x: cx, y: cy, type: "COLOR_CHANGE", colorIndex });
      colorIndex++;
    } else if (isTrim) {
      stitches.push({ x: cx, y: cy, type: "JUMP", colorIndex });
    } else {
      stitches.push({ x: cx, y: cy, type: "STITCH", colorIndex });
      updateBounds(bounds, cx, cy);
    }
  }
  const defaults = ["#7A9E7E","#C8A96E","#5B7FA6","#D4845A","#9B6BB5","#4AABB8","#D4635A","#8B5E3C","#3A6351","#C4A35A"];
  const palette = Array.from({ length: colorIndex + 1 }, (_, i) => defaults[i % defaults.length]);
  return { stitches, colorCount: colorIndex + 1, palette,
    width: bounds.minX === Infinity ? 0 : bounds.maxX - bounds.minX,
    height: bounds.minY === Infinity ? 0 : bounds.maxY - bounds.minY,
    stitchCount: stitches.filter(s => s.type === "STITCH").length, format: "DST", label };
}

/* ─── PES PARSER (pecStart + 532 per reference) ─────────────────── */
function parsePES(buf: ArrayBuffer): ParsedDesign {
  const file = new EmbFile(buf);
  const sig = file.getString(0, 4);
  const isPEC = sig === "#PEC";
  if (isPEC) return parsePEC(buf);
  const pecStart = file.getInt32(8, true);
  const label = file.getString(pecStart + 3, 16) || "PES Design";
  file.seek(pecStart + 48);
  const numColors = file.getUint8() + 1;
  const palette: string[] = [];
  for (let i = 0; i < numColors; i++) {
    palette.push(PEC_PALETTE[file.getUint8() % PEC_PALETTE.length]);
  }
  file.seek(pecStart + 532);
  const stitches: Stitch[] = [];
  const bounds: Bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  const ci = { v: 0 };
  readPecStitches(file, stitches, palette, ci, bounds);
  while (palette.length <= ci.v) palette.push(PEC_PALETTE[palette.length % PEC_PALETTE.length]);
  return { stitches, colorCount: ci.v + 1, palette,
    width: bounds.minX === Infinity ? 0 : bounds.maxX - bounds.minX,
    height: bounds.minY === Infinity ? 0 : bounds.maxY - bounds.minY,
    stitchCount: stitches.filter(s => s.type === "STITCH").length, format: "PES", label };
}

/* ─── PEC PARSER (standalone .pec file) ─────────────────────────── */
function parsePEC(buf: ArrayBuffer): ParsedDesign {
  const file = new EmbFile(buf);
  file.seek(0x38);
  const colorChanges = file.getUint8();
  const palette: string[] = [];
  for (let i = 0; i <= colorChanges; i++) {
    palette.push(PEC_PALETTE[file.getUint8() % 65]);
  }
  file.seek(0x21c);
  const stitches: Stitch[] = [];
  const bounds: Bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  const ci = { v: 0 };
  readPecStitches(file, stitches, palette, ci, bounds);
  while (palette.length <= ci.v) palette.push(PEC_PALETTE[palette.length % PEC_PALETTE.length]);
  return { stitches, colorCount: ci.v + 1, palette,
    width: bounds.minX === Infinity ? 0 : bounds.maxX - bounds.minX,
    height: bounds.minY === Infinity ? 0 : bounds.maxY - bounds.minY,
    stitchCount: stitches.filter(s => s.type === "STITCH").length, format: "PEC", label: "PEC Design" };
}

/* ─── JEF PARSER ─────────────────────────────────────────────────── */
const JEF_COLORS = [
  "#000000","#000000","#FFFFFF","#FFFF17","#FAA060","#5C7649","#40C030","#65C2C8",
  "#AC80BE","#F5BBCB","#FF0000","#C08000","#0000F0","#E4C35D","#A52A2A","#D5B0D4",
  "#FCF294","#F0D0C0","#FFC000","#C9A480","#9B3D4B","#A0B8CC","#7FC21C","#B9B9B9",
  "#A0A0A0","#98D6BD","#B8F0F0","#368BA0","#4F83AB","#386A91","#00206B","#E5C5CA",
  "#F9676B","#E3311F","#E2A188","#B59474","#E4CF99","#E1CB00","#E1ADD4","#C3007E",
  "#80004B","#A060B0","#C04020","#CAE0C0","#899856","#00AA00","#218A21","#5DAE94",
  "#4CBF8F","#007772","#707070","#F2FFFF","#B15818","#CB8A07","#F7927B","#986929",
  "#A27148","#7B554A","#4F3946","#523A97","#0000A0","#0096DE","#B2DD53","#FA8FBB",
  "#DE649E","#B55066","#5E5747","#4C881F","#E4DC79","#CB8A1A","#C6AA42","#EC B02C",
  "#F88040","#FFE505","#FA7A7A","#6BE000","#38AA6C","#E3C4B4","#E3AC81",
];
function parseJEF(buf: ArrayBuffer): ParsedDesign {
  const file = new EmbFile(buf);
  file.seek(24);
  const colorCount = file.getInt32(file.tell(), true);
  const stitchCountHint = file.getInt32(file.tell(), true);
  file.seek(file.tell() + 84);
  const palette: string[] = [];
  for (let i = 0; i < colorCount; i++) {
    const idx = file.getUint32(file.tell(), true) % JEF_COLORS.length;
    palette.push(JEF_COLORS[idx]);
  }
  file.seek(file.tell() + (6 - colorCount) * 4);
  const stitches: Stitch[] = [];
  const bounds: Bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  let cx = 0, cy = 0, colorIndex = 0;
  let processed = 0;
  while (file.tell() < file.byteLength - 1 && processed < stitchCountHint + 100) {
    const byte1 = file.getUint8(), byte2 = file.getUint8();
    if (byte1 === 0x80) {
      if ((byte2 & 0x01) !== 0 || byte2 === 0x02 || byte2 === 0x04) {
        const b1 = file.getUint8(), b2 = file.getUint8();
        const type: StitchType = (byte2 & 0x01) ? "COLOR_CHANGE" : "TRIM";
        const dx = b1 >= 0x80 ? -(~b1 & 0xff) - 1 : b1;
        const dy = b2 >= 0x80 ? -(~b2 & 0xff) - 1 : b2;
        cx += dx; cy += dy;
        if (type === "COLOR_CHANGE") { stitches.push({ x: cx, y: cy, type, colorIndex }); colorIndex++; }
        else { stitches.push({ x: cx, y: cy, type, colorIndex }); }
        processed++; continue;
      } else if (byte2 === 0x10) { break; }
    }
    const dx = byte1 >= 0x80 ? -(~byte1 & 0xff) - 1 : byte1;
    const dy = byte2 >= 0x80 ? -(~byte2 & 0xff) - 1 : byte2;
    cx += dx; cy -= dy;
    stitches.push({ x: cx, y: cy, type: "STITCH", colorIndex });
    updateBounds(bounds, cx, cy);
    processed++;
  }
  while (palette.length <= colorIndex) palette.push(JEF_COLORS[palette.length % JEF_COLORS.length]);
  return { stitches, colorCount: colorIndex + 1, palette,
    width: bounds.minX === Infinity ? 0 : bounds.maxX - bounds.minX,
    height: bounds.minY === Infinity ? 0 : bounds.maxY - bounds.minY,
    stitchCount: stitches.filter(s => s.type === "STITCH").length, format: "JEF", label: "JEF Design" };
}

/* ─── EXP PARSER ─────────────────────────────────────────────────── */
function parseEXP(buf: ArrayBuffer): ParsedDesign {
  const file = new EmbFile(buf);
  const stitches: Stitch[] = [];
  const bounds: Bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  let cx = 0, cy = 0, colorIndex = 0;
  while (file.tell() < file.byteLength - 1) {
    let b0 = file.getInt8(), b1 = file.getInt8();
    let type: StitchType = "STITCH";
    if (b0 === -128) {
      if ((b1 & 1) !== 0) {
        b0 = file.getInt8(); b1 = file.getInt8(); type = "COLOR_CHANGE";
      } else if (b1 === 2 || b1 === 4) {
        b0 = file.getInt8(); b1 = file.getInt8(); type = "TRIM";
      } else if (b1 === -128) {
        file.getInt8(); file.getInt8(); continue;
      }
    }
    const dx = b0 > 128 ? -(~b0 & 0xff) - 1 : b0;
    const dy = b1 > 128 ? -(~b1 & 0xff) - 1 : b1;
    cx += dx; cy -= dy;
    if (type === "COLOR_CHANGE") { stitches.push({ x: cx, y: cy, type, colorIndex }); colorIndex++; }
    else { stitches.push({ x: cx, y: cy, type, colorIndex }); if (type === "STITCH") updateBounds(bounds, cx, cy); }
  }
  const defaults = ["#7A9E7E","#C8A96E","#5B7FA6","#D4845A","#9B6BB5","#4AABB8","#D4635A","#8B5E3C","#3A6351","#C4A35A"];
  const palette = Array.from({ length: colorIndex + 1 }, (_, i) => defaults[i % defaults.length]);
  return { stitches, colorCount: colorIndex + 1, palette,
    width: bounds.minX === Infinity ? 0 : bounds.maxX - bounds.minX,
    height: bounds.minY === Infinity ? 0 : bounds.maxY - bounds.minY,
    stitchCount: stitches.filter(s => s.type === "STITCH").length, format: "EXP", label: "EXP Design" };
}

/* ─── DISPATCHER ─────────────────────────────────────────────────── */
function parseEmbroidery(buf: ArrayBuffer, ext: string): ParsedDesign {
  switch (ext) {
    case "dst": return parseDST(buf);
    case "jef": return parseJEF(buf);
    case "exp": return parseEXP(buf);
    case "pec": return parsePEC(buf);
    default:    return parsePES(buf); // .pes and fallback
  }
}

/* ─── FABRIC TEXTURE DRAWER ─────────────────────────────────────── */
function drawFabricTexture(ctx: CanvasRenderingContext2D, w: number, h: number, fabricType: string, customBg?: string) {
  ctx.save();
  if (fabricType === "custom" && customBg) {
    ctx.fillStyle = customBg;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
    return;
  }

  // ── Cloth: denim-style diagonal twill (matches reference photo) ──
  if (fabricType === "cloth") {
    ctx.fillStyle = "#141618";
    ctx.fillRect(0, 0, w, h);

    const pitch = 6; // px per twill ridge
    const diag = w + h;

    // Main diagonal twill ridges — batched for performance
    ctx.beginPath();
    ctx.strokeStyle = "rgba(255,255,255,0.10)";
    ctx.lineWidth = pitch * 0.55;
    for (let d = -diag; d < diag * 2; d += pitch) {
      ctx.moveTo(d, 0); ctx.lineTo(d + h, h);
    }
    ctx.stroke();

    ctx.beginPath();
    ctx.strokeStyle = "rgba(0,0,0,0.28)";
    ctx.lineWidth = pitch * 0.45;
    for (let d = -diag; d < diag * 2; d += pitch) {
      ctx.moveTo(d + pitch * 0.6, 0); ctx.lineTo(d + pitch * 0.6 + h, h);
    }
    ctx.stroke();

    // Fine cross-grain lines (perpendicular weft — subtle, denser)
    ctx.beginPath();
    ctx.strokeStyle = "rgba(255,255,255,0.025)";
    ctx.lineWidth = 0.6;
    for (let d = -diag; d < diag * 2; d += pitch * 0.75) {
      ctx.moveTo(d + h, 0); ctx.lineTo(d, h);
    }
    ctx.stroke();

    // Vignette
    const vig = ctx.createRadialGradient(w/2, h/2, Math.min(w,h)*0.25, w/2, h/2, Math.max(w,h)*0.85);
    vig.addColorStop(0, "rgba(0,0,0,0)");
    vig.addColorStop(1, "rgba(0,0,0,0.60)");
    ctx.fillStyle = vig; ctx.fillRect(0, 0, w, h);
    ctx.restore();
    return;
  }

  // ── Leather ──────────────────────────────────────────────────────
  if (fabricType === "leather") {
    ctx.fillStyle = "#0a0806";
    ctx.fillRect(0, 0, w, h);
    ctx.beginPath(); ctx.strokeStyle = "rgba(180,130,80,0.05)"; ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 9) { ctx.moveTo(x,0); ctx.lineTo(x,h); }
    ctx.stroke();
    ctx.beginPath(); ctx.strokeStyle = "rgba(180,130,80,0.03)"; ctx.lineWidth = 0.6;
    for (let y = 0; y < h; y += 9) { ctx.moveTo(0,y); ctx.lineTo(w,y); }
    ctx.stroke();
    const vigL = ctx.createRadialGradient(w/2,h/2,Math.min(w,h)*0.3,w/2,h/2,Math.max(w,h)*0.8);
    vigL.addColorStop(0,"rgba(0,0,0,0)"); vigL.addColorStop(1,"rgba(0,0,0,0.55)");
    ctx.fillStyle=vigL; ctx.fillRect(0,0,w,h);
    ctx.restore();
    return;
  }

  // ── Fleece ───────────────────────────────────────────────────────
  ctx.fillStyle = "#15131d";
  ctx.fillRect(0, 0, w, h);
  ctx.beginPath(); ctx.strokeStyle = "rgba(255,255,255,0.05)"; ctx.lineWidth = 0.7;
  for (let x = 0; x < w; x += 3.5) { ctx.moveTo(x,0); ctx.lineTo(x,h); }
  ctx.stroke();
  ctx.beginPath(); ctx.strokeStyle = "rgba(255,255,255,0.05)"; ctx.lineWidth = 0.7;
  for (let y = 0; y < h; y += 3.5) { ctx.moveTo(0,y); ctx.lineTo(w,y); }
  ctx.stroke();
  const vigF = ctx.createRadialGradient(w/2,h/2,Math.min(w,h)*0.3,w/2,h/2,Math.max(w,h)*0.8);
  vigF.addColorStop(0,"rgba(0,0,0,0)"); vigF.addColorStop(1,"rgba(0,0,0,0.5)");
  ctx.fillStyle=vigF; ctx.fillRect(0,0,w,h);
  ctx.restore();
}

/* ─── THREAD COLOR HELPERS ───────────────────────────────────────── */
function shadeHex(hex: string, amount: number): string {
  const n = parseInt(hex.replace("#","").padEnd(6,"0").slice(0,6), 16);
  const clamp = (v: number) => Math.max(0, Math.min(255, v));
  const r = clamp(((n >> 16) & 0xff) + amount);
  const g = clamp(((n >> 8) & 0xff) + amount);
  const b = clamp((n & 0xff) + amount);
  return `#${r.toString(16).padStart(2,"0")}${g.toString(16).padStart(2,"0")}${b.toString(16).padStart(2,"0")}`;
}
function hexAlpha(hex: string, a: number): string {
  const n = parseInt(hex.replace("#","").padEnd(6,"0").slice(0,6), 16);
  return `rgba(${(n>>16)&0xff},${(n>>8)&0xff},${n&0xff},${a})`;
}

/* ─── CANVAS RENDERER ───────────────────────────────────────────── */
function renderDesign(
  canvas: HTMLCanvasElement, design: ParsedDesign, colors: string[],
  scale: number, offsetX: number, offsetY: number,
  maxStitchIdx: number = Infinity, fabricType = "cloth", customBg?: string
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawFabricTexture(ctx, canvas.width, canvas.height, fabricType, customBg);

  const {stitches} = design;
  if (!stitches.length) return;

  let minX=Infinity, maxX=-Infinity, minY=Infinity, maxY=-Infinity;
  for (const s of stitches) {
    if (s.type==="STITCH") {
      if(s.x<minX)minX=s.x; if(s.x>maxX)maxX=s.x;
      if(s.y<minY)minY=s.y; if(s.y>maxY)maxY=s.y;
    }
  }
  if (minX===Infinity) return;
  const cx=(minX+maxX)/2, cy=(minY+maxY)/2;
  const toSX=(x:number)=>canvas.width/2+(x-cx)*scale+offsetX;
  const toSY=(y:number)=>canvas.height/2+(y-cy)*scale+offsetY;

  // Group into color segments
  const segments: {start:number;end:number;ci:number}[] = [];
  let segStart=0, currentCI=0;
  const limit = Math.min(stitches.length-1, maxStitchIdx);
  for (let i=0; i<=limit; i++) {
    const s=stitches[i];
    if (s.type==="COLOR_CHANGE" || i===limit) {
      segments.push({start:segStart,end:i,ci:currentCI});
      segStart=i+1; currentCI=s.colorIndex+(s.type==="COLOR_CHANGE"?1:0);
    }
  }

  const BRIDGE_THRESHOLD = 30; // stitch units (~3mm)

  // ─── Thread renderer — stitchcount.app technique ─────────────────
  // Radial gradient centered at the MIDPOINT of each stitch:
  //   bright at center  →  true color  →  slight shadow at round caps
  // This "fiber glow" is exactly what real embroidery looks like:
  //   ∙ Satin areas → all stitches bright in middle → uniform sheen band
  //   ∙ Fill areas  → stitch centers form a corrugated texture
  //   ∙ Round caps  → appear slightly darker, bounding each stitch clearly
  //
  // lineWidth clamped [2, 9] px at canvas-pixel scale:
  //   scale × 5  gives ~0.5 mm thread — fills design area like real embroidery.
  const lw = Math.max(2, Math.min(9, scale * 5));
  ctx.lineWidth = lw;
  ctx.lineCap  = "round";
  ctx.lineJoin = "round";

  // Proportional RGB multiply — preserves hue in dark shadows.
  function tc(hex: string, f: number): string {
    const n = parseInt(hex.replace("#","").padEnd(6,"0").slice(0,6), 16);
    const q = (v:number) => Math.max(0,Math.min(255,Math.round(v)));
    return `#${q(((n>>16)&0xff)*f).toString(16).padStart(2,"0")}${q(((n>>8)&0xff)*f).toString(16).padStart(2,"0")}${q((n&0xff)*f).toString(16).padStart(2,"0")}`;
  }

  function drawThread(x1:number,y1:number,x2:number,y2:number,color:string) {
    const dx = x2-x1, dy = y2-y1;
    const len = Math.hypot(dx, dy);
    if (len < 0.3) return;

    // Radial gradient from stitch MIDPOINT outward to just past stitch ends.
    // r = len × 0.62 so at each round cap (distance len/2 from center)
    // gradient position = 0.81 → interpolating between stop 0.55 and 1.0
    // → cap color = tc(color, 0.73) — slightly darker than true, not black.
    const mx = (x1+x2)*0.5, my = (y1+y2)*0.5;
    const r  = len * 0.62;
    const g  = ctx.createRadialGradient(mx, my, 0, mx, my, r);
    g.addColorStop(0,    tc(color, 1.38)); // highlight at stitch center
    g.addColorStop(0.55, color);           // true color
    g.addColorStop(1,    tc(color, 0.70)); // shadow at stitch ends / caps

    ctx.strokeStyle = g;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  // Render each color segment stitch-by-stitch
  for (const seg of segments) {
    const color = colors[seg.ci] ?? colors[seg.ci % colors.length] ?? "#ffffff";
    let penDown = false;
    let lastSX = 0, lastSY = 0;
    let lastRawX = 0, lastRawY = 0;

    for (let i = seg.start; i <= seg.end && i <= limit; i++) {
      const s = stitches[i];
      const sx = toSX(s.x), sy = toSY(s.y);

      if (s.type === "STITCH") {
        if (penDown) drawThread(lastSX, lastSY, sx, sy, color);
        lastSX = sx; lastSY = sy;
        lastRawX = s.x; lastRawY = s.y;
        penDown = true;
      } else if (s.type === "JUMP") {
        const dist = Math.hypot(s.x - lastRawX, s.y - lastRawY);
        if (penDown && dist < BRIDGE_THRESHOLD) {
          // tiny gap inside a fill area — keep pen down at new position
          lastSX = sx; lastSY = sy;
        } else {
          penDown = false;
        }
        lastRawX = s.x; lastRawY = s.y;
      } else {
        // TRIM / COLOR_CHANGE — cut the thread
        penDown = false;
        lastRawX = s.x; lastRawY = s.y;
      }
    }
  }
}

function computeAutoScale(design:ParsedDesign, w:number, h:number): number {
  if (!design.width||!design.height) return 1;
  return Math.min((w*0.82)/design.width, (h*0.82)/design.height, 6);
}

/* ─── FABRIC TEXTURES ───────────────────────────────────────────── */
const FABRICS = {
  cloth: {
    bg: "#1a2340",
    css: `repeating-linear-gradient(135deg,transparent 0,transparent 3px,rgba(255,255,255,0.025) 3px,rgba(255,255,255,0.025) 4px),repeating-linear-gradient(45deg,transparent 0,transparent 3px,rgba(255,255,255,0.015) 3px,rgba(255,255,255,0.015) 4px),#1a2340`,
  },
  leather: {
    bg: "#120c08",
    css: `repeating-linear-gradient(0deg,transparent 0,transparent 5px,rgba(255,255,255,0.012) 5px,rgba(255,255,255,0.012) 6px),repeating-linear-gradient(90deg,transparent 0,transparent 8px,rgba(255,255,255,0.008) 8px,rgba(255,255,255,0.008) 9px),#110b07`,
  },
  fleece: {
    bg: "#1e1c2a",
    css: `radial-gradient(circle at 1px 1px,rgba(255,255,255,0.05) 1px,transparent 0) 0 0/6px 6px,#1e1c2a`,
  },
};

/* ─── THREAD SPOOL SVG LOGO ─────────────────────────────────────── */
function SpoolIcon({size=28}:{size?:number}) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="14" cy="6" rx="9" ry="3.5" fill="#8B5E3C"/>
      <rect x="5" y="5.5" width="18" height="17" rx="1" fill="#C4853D"/>
      <line x1="5" y1="9" x2="23" y2="9" stroke="#D4635A" strokeWidth="1.8"/>
      <line x1="5" y1="11.5" x2="23" y2="11.5" stroke="#E85D04" strokeWidth="1.8"/>
      <line x1="5" y1="14" x2="23" y2="14" stroke="#FAA307" strokeWidth="1.8"/>
      <line x1="5" y1="16.5" x2="23" y2="16.5" stroke="#E85D04" strokeWidth="1.8"/>
      <line x1="5" y1="19" x2="23" y2="19" stroke="#D4635A" strokeWidth="1.8"/>
      <ellipse cx="14" cy="22.5" rx="9" ry="3.5" fill="#8B5E3C"/>
      <ellipse cx="14" cy="6" rx="3" ry="1.4" fill="#5C3A1E"/>
      <ellipse cx="14" cy="22.5" rx="3" ry="1.4" fill="#5C3A1E"/>
    </svg>
  );
}

/* ─── FILE TYPE ICONS ───────────────────────────────────────────── */
function FileIcon({ext,color}:{ext:string;color:string}) {
  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
      <div style={{width:44,height:54,background:color,borderRadius:6,display:"flex",alignItems:"flex-end",justifyContent:"center",paddingBottom:5,position:"relative",boxShadow:"0 2px 8px rgba(0,0,0,0.4)"}}>
        <div style={{position:"absolute",top:0,right:0,width:12,height:12,background:"rgba(255,255,255,0.25)",borderRadius:"0 6px 0 6px"}}/>
        <span style={{fontSize:9,fontWeight:800,color:"#fff",letterSpacing:0.5}}>.{ext}</span>
      </div>
    </div>
  );
}

/* ─── MAIN COMPONENT ─────────────────────────────────────────────── */
export default function Viewer() {
  const [, navigate] = useLocation();
  const [design, setDesign] = useState<ParsedDesign|null>(null);
  const [editedColors, setEditedColors] = useState<string[]>([]);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState<string|null>(null);
  const [loading, setLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [fabric, setFabric] = useState<"cloth"|"leather"|"fleece">("cloth");
  const [customBg, setCustomBg] = useState("#2a1a2a");
  const [useCustomBg, setUseCustomBg] = useState(false);
  const [spm, setSpm] = useState(650);
  const [showSpmMenu, setShowSpmMenu] = useState(false);
  const [animMaxIdx, setAnimMaxIdx] = useState(Infinity);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeStep, setActiveStep] = useState<number>(-1);

  // Compute the color-change sequence (mirrors renderDesign segment logic)
  const stitchSequence = useMemo(() => {
    if (!design) return [];
    const { stitches } = design;
    const segs: { ci: number; stitchCount: number; endIdx: number }[] = [];
    let segStart = 0, currentCI = 0;
    for (let i = 0; i < stitches.length; i++) {
      const s = stitches[i];
      if (s.type === "COLOR_CHANGE" || i === stitches.length - 1) {
        const sc = stitches.slice(segStart, i + 1).filter(x => x.type === "STITCH").length;
        if (sc > 0) segs.push({ ci: currentCI, stitchCount: sc, endIdx: i });
        segStart = i + 1;
        currentCI = s.colorIndex + (s.type === "COLOR_CHANGE" ? 1 : 0);
      }
    }
    return segs;
  }, [design]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scaleRef = useRef(1);
  const offsetRef = useRef({x:0,y:0});
  const dragStartRef = useRef<{x:number;y:number}|null>(null);
  const animFrameRef = useRef<number>(0);
  const animIdxRef = useRef(0);
  const colorInputRefs = useRef<(HTMLInputElement|null)[]>([]);

  const triggerRender = useCallback(() => {
    if (!design||!canvasRef.current) return;
    renderDesign(canvasRef.current, design, editedColors, scaleRef.current,
      offsetRef.current.x, offsetRef.current.y, animMaxIdx,
      useCustomBg ? "custom" : fabric,
      useCustomBg ? customBg : undefined);
  }, [design, editedColors, fabric, useCustomBg, customBg, animMaxIdx]);

  useEffect(() => { triggerRender(); }, [triggerRender]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      canvas.width = canvas.clientWidth * devicePixelRatio;
      canvas.height = canvas.clientHeight * devicePixelRatio;
      triggerRender();
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [triggerRender]);

  // Animation loop
  useEffect(() => {
    if (!isPlaying||!design) return;
    const total = design.stitches.length;
    const speed = Math.max(50, Math.floor(total/200));
    const step = () => {
      animIdxRef.current = Math.min(animIdxRef.current+speed, total-1);
      setAnimMaxIdx(animIdxRef.current);
      if (animIdxRef.current>=total-1) { setIsPlaying(false); setAnimMaxIdx(Infinity); return; }
      animFrameRef.current = requestAnimationFrame(step);
    };
    animFrameRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [isPlaying, design]);

  const loadFile = useCallback(async (file:File) => {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const supported = ["dst","pes","pec","jef","exp"];
    if (!supported.includes(ext)) { setError("Định dạng không hỗ trợ. Vui lòng chọn .pes, .dst, .pec, .jef hoặc .exp"); return; }
    setLoading(true); setError(null); setDesign(null);
    setFileName(file.name.toUpperCase());
    animIdxRef.current = 0; setAnimMaxIdx(Infinity); setIsPlaying(false);
    try {
      const buf = await file.arrayBuffer();
      const parsed = parseEmbroidery(buf, ext);
      if (!parsed.stitches.length) { setError("Không đọc được dữ liệu từ file."); setLoading(false); return; }
      setEditedColors([...parsed.palette]);
      const canvas = canvasRef.current;
      if (canvas) scaleRef.current = computeAutoScale(parsed, canvas.width, canvas.height);
      offsetRef.current = {x:0,y:0};
      setDesign(parsed);
    } catch(e) { setError("Lỗi đọc file: "+String(e)); }
    setLoading(false);
  }, []);

  const onFileInput = (e:React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) loadFile(e.target.files[0]);
    e.target.value = "";
  };
  const onDrop = (e:React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]);
  };

  const onWheel = (e:React.WheelEvent) => {
    e.preventDefault();
    scaleRef.current = Math.max(0.05, Math.min(20, scaleRef.current*(e.deltaY<0?1.12:0.88)));
    triggerRender();
  };
  const onMouseDown = (e:React.MouseEvent) => {
    dragStartRef.current = {x:e.clientX-offsetRef.current.x, y:e.clientY-offsetRef.current.y};
  };
  const onMouseMove = (e:React.MouseEvent) => {
    if (!dragStartRef.current) return;
    offsetRef.current = {x:e.clientX-dragStartRef.current.x, y:e.clientY-dragStartRef.current.y};
    triggerRender();
  };
  const onMouseUp = () => { dragStartRef.current=null; };

  const resetView = () => {
    if (!design||!canvasRef.current) return;
    scaleRef.current = computeAutoScale(design, canvasRef.current.width, canvasRef.current.height);
    offsetRef.current = {x:0,y:0}; triggerRender();
  };

  const handlePlay = () => {
    if (!design) return;
    if (animMaxIdx>=design.stitches.length-1||animMaxIdx===Infinity) {
      animIdxRef.current=0; setAnimMaxIdx(0);
    }
    setIsPlaying(p=>!p);
  };

  const handleStep = () => {
    if (!design) return;
    setIsPlaying(false);
    // advance to next color section
    const idx = animMaxIdx===Infinity ? design.stitches.length-1 : animMaxIdx;
    let next = idx+1;
    while (next<design.stitches.length && design.stitches[next].type!=="COLOR_CHANGE") next++;
    const newIdx = next>=design.stitches.length ? Infinity : next;
    setAnimMaxIdx(newIdx);
    animIdxRef.current = next;
    // sync active step highlight
    const stepIdx = stitchSequence.findIndex(s => s.endIdx >= (newIdx===Infinity ? Infinity : next));
    setActiveStep(stepIdx);
  };

  const jumpToStep = (stepIdx: number) => {
    if (!design) return;
    setIsPlaying(false);
    const seg = stitchSequence[stepIdx];
    if (!seg) return;
    const endIdx = stepIdx === stitchSequence.length - 1 ? Infinity : seg.endIdx;
    animIdxRef.current = seg.endIdx;
    setAnimMaxIdx(endIdx);
    setActiveStep(stepIdx);
  };

  const downloadPNG = () => {
    if (!design||!canvasRef.current) return;
    const offscreen = document.createElement("canvas");
    offscreen.width = canvasRef.current.width; offscreen.height = canvasRef.current.height;
    renderDesign(offscreen,design,editedColors,scaleRef.current,offsetRef.current.x,offsetRef.current.y,animMaxIdx,
      useCustomBg ? "custom" : fabric, useCustomBg ? customBg : undefined);
    offscreen.toBlob(blob=>{
      if (!blob) return;
      const a=document.createElement("a");
      a.href=URL.createObjectURL(blob);
      a.download=fileName.replace(/\.(dst|pes)$/i,"")+".png";
      a.click();
    });
  };

  const updateColor = (i:number, color:string) => {
    setEditedColors(prev=>{const n=[...prev];n[i]=color;return n;});
  };

  const toMm = (units:number) => Math.round(units / 10);
  const timeMin = design ? Math.ceil(design.stitchCount/spm) : 0;
  const timeStr = timeMin>=60 ? `${Math.floor(timeMin/60)} h ${timeMin%60} min` : `${timeMin} min`;

  const fabricBgColor = useCustomBg ? customBg : FABRICS[fabric].bg;

  return (
    <div style={{display:"flex",flexDirection:"column",minHeight:"100dvh",background:"#0d1117",color:"#e8e8f0",fontFamily:"Inter,system-ui,sans-serif"}}>

      {/* ── Header ── */}
      <header style={{background:"#0d1117",borderBottom:"1px solid #1e2436"}}>
        {/* Tier 1 — main nav tabs */}
        <div style={{display:"flex",borderBottom:"1px solid #1e2436",padding:"0 20px",alignItems:"center",gap:4}}>
          {/* Logo */}
          <div style={{display:"flex",alignItems:"center",gap:6,marginRight:16,paddingRight:16,borderRight:"1px solid #1e2436"}}>
            <SpoolIcon size={20}/>
            <span style={{fontWeight:800,fontSize:14,color:"#fff",letterSpacing:-0.3,whiteSpace:"nowrap"}}>
              <span style={{color:"#4A9EFF"}}>stitch</span>Viewer
            </span>
          </div>
          {/* Tabs */}
          {([
            {label:"🧵 Danh mục màu chỉ", color:"#4A9EFF", active:false, onClick:()=>navigate("/")},
            {label:"🎨 Danh mục vải",       color:"#f59e0b", active:false, onClick:()=>navigate("/fabrics")},
            {label:"📁 File thêu",          color:"#a78bfa", active:true,  onClick:()=>{}},
          ] as const).map(t=>(
            <button key={t.label} onClick={t.onClick}
              style={{padding:"10px 14px",border:"none",cursor:"pointer",background:"transparent",whiteSpace:"nowrap",
                fontSize:12,fontWeight:t.active?700:500,transition:"all 0.15s",
                color:t.active?t.color:"#6b7a99",
                borderBottom:t.active?`2.5px solid ${t.color}`:"2.5px solid transparent",
                marginBottom:-1}}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Tier 2 — background picker */}
        <div style={{display:"flex",gap:6,padding:"8px 20px",alignItems:"center"}}>
          <span style={{fontSize:10,fontWeight:600,color:"#4a5580",letterSpacing:0.8,marginRight:4}}>NỀN VẢI</span>
          {(["cloth","leather","fleece"] as const).map(f=>(
            <button key={f} onClick={()=>{setFabric(f);setUseCustomBg(false);}}
              style={{padding:"4px 12px",borderRadius:20,border:"1.5px solid",fontSize:11,fontWeight:600,cursor:"pointer",transition:"all 0.15s",
                background:(!useCustomBg&&fabric===f)?"#3b82f6":"transparent",
                borderColor:(!useCustomBg&&fabric===f)?"#3b82f6":"#2a3050",
                color:(!useCustomBg&&fabric===f)?"#fff":"#6b7a99"}}>
              {f==="cloth"?"Vải":f==="leather"?"Da":"Nỉ"}
            </button>
          ))}
          <label title="Màu nền tùy chỉnh" style={{position:"relative",cursor:"pointer"}}>
            <div style={{width:24,height:24,borderRadius:20,border:"1.5px solid "+(useCustomBg?"#3b82f6":"#2a3050"),
              background:useCustomBg?customBg:"linear-gradient(135deg,#f472b6,#818cf8)",cursor:"pointer"}}
              onClick={()=>setUseCustomBg(true)}/>
            <input type="color" value={customBg} onChange={e=>{setCustomBg(e.target.value);setUseCustomBg(true);}}
              style={{position:"absolute",inset:0,opacity:0,width:"100%",height:"100%",cursor:"pointer"}}/>
          </label>
          <span style={{fontSize:10,color:"#4a5580",marginLeft:4}}>tùy chỉnh</span>
        </div>
      </header>

      {/* ── Main content ── */}
      <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",padding:"16px",gap:16}}>

        {design ? (
          <>
            {/* Preview + Info row */}
            <div style={{display:"flex",gap:14,width:"100%",maxWidth:920,alignItems:"flex-start"}}>

              {/* Preview canvas */}
              <div style={{flex:"1 1 0",minWidth:0,position:"relative"}}>
                {/* File name badge */}
                <div style={{position:"absolute",top:-10,left:"50%",transform:"translateX(-50%)",zIndex:10,
                  background:"#fff",color:"#0d1117",padding:"3px 14px",borderRadius:4,fontSize:12,fontWeight:700,letterSpacing:0.5,
                  whiteSpace:"nowrap",boxShadow:"0 2px 8px rgba(0,0,0,0.3)"}}>
                  {fileName}
                </div>

                {/* Canvas area */}
                <div style={{position:"relative",borderRadius:10,overflow:"hidden",background:fabricBgColor,aspectRatio:"4/3",
                  boxShadow:"0 4px 24px rgba(0,0,0,0.6)",border:"1px solid #1e2436"}}>

                  {/* Play / Step buttons */}
                  <div style={{position:"absolute",top:10,left:10,display:"flex",gap:6,zIndex:5}}>
                    <button onClick={handlePlay} title={isPlaying?"Pause":"Play"}
                      style={{width:30,height:30,borderRadius:6,background:"rgba(0,0,0,0.5)",border:"1px solid rgba(255,255,255,0.15)",color:"#fff",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12}}>
                      {isPlaying?"⏸":"▶"}
                    </button>
                    <button onClick={handleStep} title="Next color"
                      style={{width:30,height:30,borderRadius:6,background:"rgba(0,0,0,0.5)",border:"1px solid rgba(255,255,255,0.15)",color:"#fff",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12}}>
                      ⏭
                    </button>
                  </div>

                  <canvas ref={canvasRef} style={{width:"100%",height:"100%",display:"block",cursor:"grab",touchAction:"none"}}
                    onWheel={onWheel} onMouseDown={onMouseDown} onMouseMove={onMouseMove}
                    onMouseUp={onMouseUp} onMouseLeave={onMouseUp}/>
                </div>

                {/* Download buttons */}
                <div style={{display:"flex",gap:0,marginTop:8}}>
                  <button onClick={downloadPNG}
                    style={{flex:1,padding:"11px 0",background:"#1a1f30",border:"1px solid #2a3050",borderRight:"none",
                      borderRadius:"8px 0 0 8px",color:"#e8e8f0",cursor:"pointer",fontSize:13,fontWeight:600,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
                    ⬇ Download PNG
                  </button>
                  <button disabled title="Coming soon"
                    style={{flex:1,padding:"11px 0",background:"#1a1f30",border:"1px solid #2a3050",
                      borderRadius:"0 8px 8px 0",color:"#555",cursor:"not-allowed",fontSize:13,fontWeight:600,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
                    📄 Save as GIF
                  </button>
                </div>
              </div>

              {/* Right panel */}
              <div style={{display:"flex",flexDirection:"column",gap:10,width:220,flexShrink:0}}>

                {/* Stats card */}
                <div style={{background:"#131929",border:"1px solid #1e2a42",borderRadius:10,padding:"14px 16px"}}>
                  <div style={{fontSize:10,fontWeight:700,color:"#4A9EFF",letterSpacing:1,marginBottom:4}}>STITCH COUNT</div>
                  <div style={{fontSize:32,fontWeight:800,color:"#fff",lineHeight:1.1}}>
                    {design.stitchCount.toLocaleString()}
                  </div>
                  <div style={{fontSize:13,color:"#4A9EFF",fontWeight:600,marginTop:2,textAlign:"right"}}>
                    {toMm(design.width)} × {toMm(design.height)} mm
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginTop:10,paddingTop:10,borderTop:"1px solid #1e2a42"}}>
                    <div style={{position:"relative"}}>
                      <button onClick={()=>setShowSpmMenu(p=>!p)}
                        style={{background:"#1a2236",border:"1px solid #2a3a56",borderRadius:6,color:"#e8e8f0",padding:"4px 10px",fontSize:12,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>
                        {spm} SPM <span style={{fontSize:9}}>▼</span>
                      </button>
                      {showSpmMenu && (
                        <div style={{position:"absolute",top:"100%",left:0,marginTop:4,background:"#1a2236",border:"1px solid #2a3a56",borderRadius:6,overflow:"hidden",zIndex:20}}>
                          {[400,500,650,800,1000].map(v=>(
                            <div key={v} onClick={()=>{setSpm(v);setShowSpmMenu(false);}}
                              style={{padding:"6px 16px",cursor:"pointer",fontSize:12,color:v===spm?"#4A9EFF":"#e8e8f0",background:v===spm?"#223":"none"}}>
                              {v} SPM
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <span style={{fontSize:12,color:"#9ca3af"}}>| {timeStr}</span>
                  </div>
                </div>

                {/* Edit Colors card */}
                <div style={{background:"#131929",border:"1px solid #1e2a42",borderRadius:10,padding:"14px 16px"}}>
                  <div style={{fontSize:12,fontWeight:700,color:"#e8e8f0",marginBottom:10}}>Edit Colors</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                    {editedColors.slice(0,design.colorCount).map((c,i)=>(
                      <label key={i} style={{position:"relative",cursor:"pointer"}} title={`Color ${i+1}: ${c}`}>
                        <div style={{width:28,height:28,borderRadius:6,background:c,border:"2px solid rgba(255,255,255,0.15)",cursor:"pointer",boxShadow:"0 1px 4px rgba(0,0,0,0.4)"}}/>
                        <input type="color" value={c} onChange={e=>updateColor(i,e.target.value)}
                          ref={el=>{colorInputRefs.current[i]=el;}}
                          style={{position:"absolute",inset:0,opacity:0,width:"100%",height:"100%",cursor:"pointer"}}/>
                      </label>
                    ))}
                  </div>
                  <button onClick={()=>setEditedColors([...design.palette])}
                    style={{marginTop:10,background:"none",border:"none",color:"#4A9EFF",fontSize:11,cursor:"pointer",padding:0}}>
                    Reset màu gốc
                  </button>
                </div>

                {/* ── Stitch Order panel ── */}
                <div style={{background:"#131929",border:"1px solid #1e2a42",borderRadius:10,overflow:"hidden"}}>
                  <div style={{padding:"10px 14px 8px",borderBottom:"1px solid #1e2a42",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                    <span style={{fontSize:11,fontWeight:700,color:"#4A9EFF",letterSpacing:0.8}}>THỨ TỰ BƯỚC THÊU</span>
                    <span style={{fontSize:10,color:"#4a5580"}}>{stitchSequence.length} màu</span>
                  </div>
                  <div style={{maxHeight:260,overflowY:"auto",overflowX:"hidden"}}>
                    {stitchSequence.map((seg, i) => {
                      const color = editedColors[seg.ci] ?? "#888";
                      const isActive = activeStep === i;
                      const isDone = animMaxIdx === Infinity
                        ? true
                        : (animMaxIdx >= seg.endIdx);
                      return (
                        <div key={i} onClick={() => jumpToStep(i)}
                          style={{
                            display:"flex",alignItems:"center",gap:8,
                            padding:"7px 12px",cursor:"pointer",
                            background: isActive ? "rgba(74,158,255,0.12)" : "transparent",
                            borderLeft: isActive ? "3px solid #4A9EFF" : "3px solid transparent",
                            opacity: isDone ? 1 : 0.45,
                            transition:"background 0.1s,opacity 0.2s",
                          }}
                          onMouseEnter={e=>(e.currentTarget.style.background = isActive ? "rgba(74,158,255,0.16)" : "rgba(255,255,255,0.04)")}
                          onMouseLeave={e=>(e.currentTarget.style.background = isActive ? "rgba(74,158,255,0.12)" : "transparent")}>

                          {/* Step number */}
                          <span style={{fontSize:10,color:"#4a5580",width:14,textAlign:"right",flexShrink:0,fontWeight:600}}>
                            {i+1}
                          </span>

                          {/* Color swatch */}
                          <div style={{width:18,height:18,borderRadius:4,background:color,flexShrink:0,
                            border:"1.5px solid rgba(255,255,255,0.18)",boxShadow:"0 1px 3px rgba(0,0,0,0.5)"}}/>

                          {/* Color hex */}
                          <span style={{fontSize:10,color:"#9ca3af",flex:1,fontFamily:"monospace",letterSpacing:0.3}}>
                            {color.toUpperCase()}
                          </span>

                          {/* Stitch count */}
                          <span style={{fontSize:10,color: isDone ? "#4A9EFF" : "#4a5580",fontWeight:600,flexShrink:0}}>
                            {seg.stitchCount.toLocaleString()}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  {/* Show all button */}
                  <div style={{padding:"6px 12px",borderTop:"1px solid #1e2a42"}}>
                    <button onClick={()=>{setAnimMaxIdx(Infinity);animIdxRef.current=design!.stitches.length-1;setActiveStep(-1);}}
                      style={{width:"100%",background:"none",border:"none",color:"#4a5580",fontSize:10,cursor:"pointer",padding:"2px 0",textAlign:"center",letterSpacing:0.5}}>
                      Hiện toàn bộ
                    </button>
                  </div>
                </div>

                {/* Fit button */}
                <button onClick={resetView}
                  style={{background:"#1a1f30",border:"1px solid #2a3050",borderRadius:8,color:"#9ca3af",padding:"8px 0",cursor:"pointer",fontSize:12}}>
                  🔍 Khớp màn hình
                </button>

                {/* Upload another */}
                <label style={{cursor:"pointer"}}>
                  <input type="file" accept=".pes,.dst,.pec,.jef,.exp" onChange={onFileInput} style={{display:"none"}}/>
                  <div style={{background:"#1a1f30",border:"1px dashed #2a3050",borderRadius:8,color:"#9ca3af",padding:"8px 0",fontSize:12,textAlign:"center",cursor:"pointer"}}>
                    + Tải file khác
                  </div>
                </label>
              </div>
            </div>
          </>
        ) : (
          /* ── Upload drop zone (full area) ── */
          <div
            onDrop={onDrop}
            onDragOver={e=>{e.preventDefault();setIsDragging(true);}}
            onDragLeave={()=>setIsDragging(false)}
            style={{flex:1,width:"100%",display:"flex",flexDirection:"column",alignItems:"center",
              justifyContent:"center",gap:0,transition:"background 0.2s",
              background:isDragging?"rgba(74,158,255,0.04)":"transparent",
              border:isDragging?"2px dashed #4A9EFF":"2px dashed transparent",
              borderRadius:12}}>

            {loading ? (
              <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:16}}>
                {/* Animated spinner */}
                <svg width={56} height={56} viewBox="0 0 56 56" style={{animation:"spin 1s linear infinite"}}>
                  <circle cx={28} cy={28} r={22} stroke="#2a3050" strokeWidth={5} fill="none"/>
                  <circle cx={28} cy={28} r={22} stroke="#4A9EFF" strokeWidth={5} fill="none"
                    strokeDasharray="30 100" strokeLinecap="round"/>
                </svg>
                <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
                <div style={{color:"#4A9EFF",fontSize:15,fontWeight:600}}>Đang đọc file...</div>
              </div>
            ) : (
              <>
                {/* Upload arrow icon */}
                <svg width={72} height={72} viewBox="0 0 72 72" fill="none" style={{marginBottom:24,opacity:isDragging?1:0.85}}>
                  <circle cx={36} cy={36} r={35} stroke={isDragging?"#4A9EFF":"#2a3050"} strokeWidth={2} fill={isDragging?"rgba(74,158,255,0.08)":"#0f1520"}/>
                  <path d="M36 20 L36 48" stroke={isDragging?"#4A9EFF":"#6b7a99"} strokeWidth={3} strokeLinecap="round"/>
                  <path d="M25 31 L36 20 L47 31" stroke={isDragging?"#4A9EFF":"#6b7a99"} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                  <path d="M22 50 L50 50" stroke={isDragging?"#4A9EFF":"#6b7a99"} strokeWidth={3} strokeLinecap="round"/>
                </svg>

                <h2 style={{margin:"0 0 10px",fontSize:22,fontWeight:700,color:"#fff",letterSpacing:-0.3}}>
                  Tải lên file thêu
                </h2>
                <p style={{margin:"0 0 6px",fontSize:13,color:"#6b7a99"}}>
                  Dung lượng tối đa <strong style={{color:"#9ca3af"}}>50MB</strong>. Định dạng được hỗ trợ:
                </p>
                <p style={{margin:"0 0 32px",fontSize:13,color:"#9ca3af",fontWeight:600,letterSpacing:0.5}}>
                  .pes &nbsp;·&nbsp; .dst &nbsp;·&nbsp; .pec &nbsp;·&nbsp; .jef &nbsp;·&nbsp; .exp
                </p>

                {/* Buttons row */}
                <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:14}}>
                  <label style={{cursor:"pointer"}}>
                    <input type="file" accept=".pes,.dst,.pec,.jef,.exp" onChange={onFileInput} style={{display:"none"}}/>
                    <span style={{display:"inline-block",padding:"11px 36px",background:"#3b82f6",color:"#fff",
                      borderRadius:8,fontWeight:700,fontSize:15,cursor:"pointer",
                      boxShadow:"0 2px 16px rgba(59,130,246,0.35)",transition:"opacity 0.15s"}}
                      onMouseEnter={e=>(e.currentTarget.style.opacity="0.88")}
                      onMouseLeave={e=>(e.currentTarget.style.opacity="1")}>
                      Chọn file
                    </span>
                  </label>
                  <span style={{color:"#3a4560",fontSize:13}}>hoặc</span>
                  <span style={{color:"#6b7a99",fontSize:13}}>kéo thả vào đây</span>
                </div>

                {error && <div style={{color:"#ff6b6b",fontSize:13,marginTop:4}}>{error}</div>}

                <p style={{margin:"32px 0 0",fontSize:11,color:"#3a4560",maxWidth:420,textAlign:"center",lineHeight:1.6}}>
                  Không tải lên tài liệu thêu có bản quyền mà bạn không sở hữu hoặc không có quyền sử dụng.
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
