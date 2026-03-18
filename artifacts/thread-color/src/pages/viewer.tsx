import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "wouter";

/* ─── TYPES ─────────────────────────────────────────────────────── */
type StitchType = "STITCH" | "JUMP" | "TRIM" | "COLOR_CHANGE" | "END";

interface Stitch {
  x: number;
  y: number;
  type: StitchType;
  colorIndex: number;
}

interface ParsedDesign {
  stitches: Stitch[];
  colorCount: number;
  palette: string[];
  width: number;
  height: number;
  stitchCount: number;
  format: "DST" | "PES";
  label: string;
}

/* ─── PEC BUILT-IN THREAD COLORS ────────────────────────────────── */
const PEC_PALETTE: string[] = [
  "#1A0A94","#1A0A94","#C8D200","#B5AD00","#2D7027","#E3E3E3","#E3E3E3",
  "#1A92D3","#6FC3E3","#F0C3E3","#E3C3AB","#6B8267","#5E9B8A","#8AC89B",
  "#6BCDB2","#37A923","#D9C300","#FFFF00","#FFC000","#FF8000","#FF0000",
  "#E31984","#CC0088","#AA00AA","#6600CC","#2200BB","#0066CC","#0099DD",
  "#00AAAA","#009966","#339900","#66BB00","#CCCC00","#FFCC00","#FF9900",
  "#FF6600","#FF0000","#CC0033","#990066","#660099","#0000AA","#0033CC",
  "#0066FF","#00AACC","#00CC99","#33CC33","#99CC00","#CCCC00","#FFFF00",
  "#FFCC33","#FF9933","#FF6633","#FF3333","#CC3366","#993399","#663399",
  "#336699","#0099CC","#33CCCC","#66CC99","#99CC66","#CCCC66","#FFCC66",
  "#FF9966","#FF6666","#FF9999","#FFCCCC","#CCFFCC","#99FFCC","#66FFFF",
];

/* ─── DST PARSER ─────────────────────────────────────────────────── */
function parseDST(buffer: ArrayBuffer): ParsedDesign {
  const data = new Uint8Array(buffer);
  const stitches: Stitch[] = [];

  // Parse header for label
  const headerBytes = data.slice(0, 512);
  let label = "";
  const laIdx = Array.from(headerBytes).findIndex(
    (_, i) => headerBytes[i] === 0x4C && headerBytes[i + 1] === 0x41 && headerBytes[i + 2] === 0x3A
  );
  if (laIdx >= 0) {
    const end = Array.from(headerBytes)
      .slice(laIdx + 3)
      .findIndex((c) => c === 0x0D || c === 0x0A);
    label = String.fromCharCode(...headerBytes.slice(laIdx + 3, laIdx + 3 + (end > 0 ? end : 16))).trim();
  }

  let cx = 0, cy = 0;
  let colorIndex = 0;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

  for (let i = 512; i < data.length - 2; i += 3) {
    const b0 = data[i];
    const b1 = data[i + 1];
    const b2 = data[i + 2];

    // End of file: 0x00 0x00 0xF3
    if (b0 === 0x00 && b1 === 0x00 && b2 === 0xF3) break;

    // Build 24-bit cmd: b0 | (b1 << 8) | (b2 << 16)
    // From manthrax/DSTLoader.js - bit assignments:
    // b2 (bits 16-23): y+1, y-1, y+9, y-9, x-9, x+9, x-1, x+1
    // b1 (bits 8-15):  y+3, y-3, y+27, y-27, x-27, x+27, x-3, x+3
    // b0 (bits 0-7):   jump, cstop, y+81, y-81, x-81, x+81
    let dx = 0, dy = 0;
    if (b2 & 0x80) dy += 1;
    if (b2 & 0x40) dy -= 1;
    if (b2 & 0x20) dy += 9;
    if (b2 & 0x10) dy -= 9;
    if (b2 & 0x08) dx -= 9;
    if (b2 & 0x04) dx += 9;
    if (b2 & 0x02) dx -= 1;
    if (b2 & 0x01) dx += 1;

    if (b1 & 0x80) dy += 3;
    if (b1 & 0x40) dy -= 3;
    if (b1 & 0x20) dy += 27;
    if (b1 & 0x10) dy -= 27;
    if (b1 & 0x08) dx -= 27;
    if (b1 & 0x04) dx += 27;
    if (b1 & 0x02) dx -= 3;
    if (b1 & 0x01) dx += 3;

    if (b0 & 0x04) dx += 81;
    if (b0 & 0x08) dx -= 81;
    if (b0 & 0x10) dy -= 81;
    if (b0 & 0x20) dy += 81;

    const isJump = (b0 & 0x80) !== 0;
    const isCStop = (b0 & 0x40) !== 0;

    cx += dx;
    cy += dy;

    if (isCStop) {
      stitches.push({ x: cx, y: cy, type: "COLOR_CHANGE", colorIndex });
      colorIndex++;
    } else if (isJump) {
      stitches.push({ x: cx, y: cy, type: "JUMP", colorIndex });
    } else {
      stitches.push({ x: cx, y: cy, type: "STITCH", colorIndex });
      if (cx < minX) minX = cx;
      if (cx > maxX) maxX = cx;
      if (cy < minY) minY = cy;
      if (cy > maxY) maxY = cy;
    }
  }

  const palette = Array.from({ length: colorIndex + 1 }, (_, i) => {
    const defaults = [
      "#1a1a2e","#e94560","#0f3460","#16213e","#533483","#2d6a4f",
      "#d62828","#023e8a","#f77f00","#4cc9f0","#7209b7","#3a0ca3",
    ];
    return defaults[i % defaults.length];
  });

  const stitchCount = stitches.filter((s) => s.type === "STITCH").length;

  return {
    stitches, colorCount: colorIndex + 1, palette,
    width: maxX - minX, height: maxY - minY, stitchCount,
    format: "DST", label: label || "DST Design",
  };
}

/* ─── PES / PEC PARSER ──────────────────────────────────────────── */
function signed12(b: number): number {
  b &= 0xfff;
  return b > 0x7ff ? -0x1000 + b : b;
}
function signed7(b: number): number {
  return b > 63 ? -128 + b : b;
}

function parsePES(buffer: ArrayBuffer): ParsedDesign {
  const data = new Uint8Array(buffer);
  const view = new DataView(buffer);

  // Read signature
  const sig = String.fromCharCode(data[0], data[1], data[2], data[3]);
  const isPEC = sig === "#PEC";

  let pecOffset = 0;
  let pesLabel = "";

  if (isPEC) {
    pecOffset = 0;
  } else {
    // PES: bytes 8-11 are little-endian uint32 offset to PEC block
    pecOffset = view.getUint32(8, true);
    pesLabel = String.fromCharCode(...data.slice(4, 8)).trim();
  }

  // Parse PEC header to find colors and stitch data
  // PEC structure at pecOffset:
  // +0:  "LA:" (3 bytes)
  // +3:  label (16 bytes)
  // +19: 0x0F bytes skip (15 bytes)
  // +34: graphic byte stride (1 byte)
  // +35: graphic icon height (1 byte)
  // +36: 0x0C bytes skip (12 bytes)
  // +48: color_changes (1 byte)
  // +49: color table (color_changes+1 bytes)
  // +49+(cc+1): skip (0x1D0 - cc) bytes
  // ... then 3 bytes for block end, 11 bytes, then stitches

  let p = pecOffset;
  const la = String.fromCharCode(data[p], data[p + 1], data[p + 2]);
  p += 3;

  let label = "";
  if (la === "LA:") {
    label = String.fromCharCode(...data.slice(p, p + 16)).replace(/[\x00\xff]/g, "").trim();
    p += 16;
    p += 0xf; // skip
    p += 1; // pec_graphic_byte_stride
    p += 1; // pec_graphic_icon_height
    p += 0xc; // skip
    const colorChanges = data[p];
    p += 1;
    const countColors = colorChanges + 1;
    const colorBytes = data.slice(p, p + countColors);
    p += countColors;
    p += 0x1d0 - colorChanges; // skip to block end
    p += 3; // stitch_block_end (3-byte int we skip)
    p += 0x0b; // skip more
    // Now p points to the stitch data

    // Build palette from color indices
    const palette: string[] = [];
    for (let i = 0; i < countColors; i++) {
      const idx = colorBytes[i] % PEC_PALETTE.length;
      palette.push(PEC_PALETTE[idx]);
    }

    return readPECStitches(data, p, palette, label || pesLabel || "PES Design");
  }

  // Fallback: try to find "LA:" in the buffer near pecOffset
  for (let search = pecOffset; search < Math.min(pecOffset + 256, data.length - 3); search++) {
    if (data[search] === 0x4c && data[search + 1] === 0x41 && data[search + 2] === 0x3a) {
      const fallbackLabel = String.fromCharCode(...data.slice(search + 3, search + 19)).replace(/[\x00\xff]/g, "").trim();
      const fallbackP = search + 3 + 16 + 0xf + 1 + 1 + 0xc;
      const cc = data[fallbackP];
      const cbStart = fallbackP + 1;
      const colorBytes = data.slice(cbStart, cbStart + cc + 1);
      const stitchStart = cbStart + cc + 1 + (0x1d0 - cc) + 3 + 0x0b;
      const palette: string[] = [];
      for (let i = 0; i <= cc; i++) {
        const idx = colorBytes[i] % PEC_PALETTE.length;
        palette.push(PEC_PALETTE[idx]);
      }
      return readPECStitches(data, stitchStart, palette, fallbackLabel || "PES Design");
    }
  }

  return { stitches: [], colorCount: 1, palette: ["#333"], width: 0, height: 0, stitchCount: 0, format: "PES", label: "Parse error" };
}

function readPECStitches(data: Uint8Array, startPos: number, palette: string[], label: string): ParsedDesign {
  const FLAG_LONG = 0x80;
  const JUMP_CODE = 0x10;
  const TRIM_CODE = 0x20;

  const stitches: Stitch[] = [];
  let cx = 0, cy = 0;
  let colorIndex = 0;
  let i = startPos;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

  while (i < data.length - 1) {
    const val1 = data[i];
    const val2 = data[i + 1];

    if (val1 === 0xff && val2 === 0x00) break;

    if (val1 === 0xfe && val2 === 0xb0) {
      i += 3;
      stitches.push({ x: cx, y: cy, type: "COLOR_CHANGE", colorIndex });
      colorIndex++;
      continue;
    }

    let x: number, y: number;
    let isJump = false;

    if (val1 & FLAG_LONG) {
      if (val1 & TRIM_CODE) isJump = true;
      if (val1 & JUMP_CODE) isJump = true;
      const code = (val1 << 8) | val2;
      x = signed12(code);
      i += 2;
      if (i >= data.length) break;
      const val2b = data[i];
      if (val2b & FLAG_LONG) {
        if (val2b & TRIM_CODE) isJump = true;
        if (val2b & JUMP_CODE) isJump = true;
        if (i + 1 >= data.length) break;
        const val3 = data[i + 1];
        y = signed12((val2b << 8) | val3);
        i += 2;
      } else {
        y = signed7(val2b);
        i += 1;
      }
    } else {
      x = signed7(val1);
      if (val2 & FLAG_LONG) {
        if (val2 & TRIM_CODE) isJump = true;
        if (val2 & JUMP_CODE) isJump = true;
        if (i + 2 >= data.length) break;
        const val3 = data[i + 2];
        y = signed12((val2 << 8) | val3);
        i += 3;
      } else {
        y = signed7(val2);
        i += 2;
      }
    }

    cx += x;
    cy += y;

    if (isJump) {
      stitches.push({ x: cx, y: cy, type: "JUMP", colorIndex });
    } else {
      stitches.push({ x: cx, y: cy, type: "STITCH", colorIndex });
      if (cx < minX) minX = cx;
      if (cx > maxX) maxX = cx;
      if (cy < minY) minY = cy;
      if (cy > maxY) maxY = cy;
    }
  }

  while (palette.length <= colorIndex) {
    palette.push(PEC_PALETTE[palette.length % PEC_PALETTE.length]);
  }

  const stitchCount = stitches.filter((s) => s.type === "STITCH").length;

  return {
    stitches, colorCount: colorIndex + 1, palette,
    width: minX === Infinity ? 0 : maxX - minX,
    height: minY === Infinity ? 0 : maxY - minY,
    stitchCount, format: "PES", label,
  };
}

/* ─── CANVAS RENDERER ───────────────────────────────────────────── */
function renderDesign(
  canvas: HTMLCanvasElement,
  design: ParsedDesign,
  scale: number,
  offsetX: number,
  offsetY: number
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#1a1a2e";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const { stitches, palette } = design;
  if (!stitches.length) return;

  // Compute bounding box
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const s of stitches) {
    if (s.type === "STITCH") {
      if (s.x < minX) minX = s.x;
      if (s.x > maxX) maxX = s.x;
      if (s.y < minY) minY = s.y;
      if (s.y > maxY) maxY = s.y;
    }
  }
  if (minX === Infinity) return;

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  const toScreenX = (x: number) =>
    canvas.width / 2 + (x - cx) * scale + offsetX;
  const toScreenY = (y: number) =>
    canvas.height / 2 + (y - cy) * scale + offsetY;

  // Draw stitches grouped by color segments
  let segStart = 0;
  const segments: { start: number; end: number; color: string }[] = [];
  let currentColor = palette[0] ?? "#fff";

  for (let i = 0; i < stitches.length; i++) {
    const s = stitches[i];
    if (s.type === "COLOR_CHANGE" || i === stitches.length - 1) {
      segments.push({ start: segStart, end: i, color: currentColor });
      segStart = i + 1;
      currentColor = palette[s.colorIndex + 1] ?? palette[(s.colorIndex + 1) % palette.length] ?? "#fff";
    }
  }
  if (segStart < stitches.length) {
    segments.push({ start: segStart, end: stitches.length - 1, color: currentColor });
  }

  for (const seg of segments) {
    ctx.beginPath();
    ctx.strokeStyle = seg.color;
    ctx.lineWidth = Math.max(0.5, scale * 0.8);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    let penDown = false;
    for (let i = seg.start; i <= seg.end; i++) {
      const s = stitches[i];
      if (s.type === "STITCH") {
        const sx = toScreenX(s.x);
        const sy = toScreenY(s.y);
        if (!penDown) {
          ctx.moveTo(sx, sy);
          penDown = true;
        } else {
          ctx.lineTo(sx, sy);
        }
      } else if (s.type === "JUMP" || s.type === "TRIM") {
        penDown = false;
        const sx = toScreenX(s.x);
        const sy = toScreenY(s.y);
        ctx.moveTo(sx, sy);
      }
    }
    ctx.stroke();
  }
}

/* ─── AUTO-SCALE HELPER ─────────────────────────────────────────── */
function computeAutoScale(design: ParsedDesign, canvasW: number, canvasH: number): number {
  if (!design.width || !design.height) return 1;
  const scaleX = (canvasW * 0.85) / design.width;
  const scaleY = (canvasH * 0.85) / design.height;
  return Math.min(scaleX, scaleY, 4);
}

/* ─── MAIN COMPONENT ─────────────────────────────────────────────── */
export default function Viewer() {
  const [, navigate] = useLocation();
  const [design, setDesign] = useState<ParsedDesign | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scaleRef = useRef(1);
  const offsetRef = useRef({ x: 0, y: 0 });
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const [renderTick, setRenderTick] = useState(0);

  const triggerRender = useCallback(() => setRenderTick((t) => t + 1), []);

  // Re-render whenever design or renderTick changes
  useEffect(() => {
    if (!design || !canvasRef.current) return;
    renderDesign(canvasRef.current, design, scaleRef.current, offsetRef.current.x, offsetRef.current.y);
  }, [design, renderTick]);

  // Resize canvas to fill container
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

  const loadFile = useCallback(async (file: File) => {
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext !== "dst" && ext !== "pes") {
      setError("Chỉ hỗ trợ file .pes và .dst");
      return;
    }
    setLoading(true);
    setError(null);
    setDesign(null);
    try {
      const buffer = await file.arrayBuffer();
      let parsed: ParsedDesign;
      if (ext === "dst") {
        parsed = parseDST(buffer);
      } else {
        parsed = parsePES(buffer);
      }
      if (!parsed.stitches.length) {
        setError("Không đọc được dữ liệu từ file này.");
        setLoading(false);
        return;
      }
      // Auto-scale
      const canvas = canvasRef.current;
      if (canvas) {
        scaleRef.current = computeAutoScale(parsed, canvas.width, canvas.height);
      }
      offsetRef.current = { x: 0, y: 0 };
      setDesign(parsed);
    } catch (e) {
      setError("Lỗi khi đọc file: " + String(e));
    }
    setLoading(false);
  }, []);

  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) loadFile(file);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) loadFile(file);
  };

  // Mouse wheel zoom
  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    scaleRef.current = Math.max(0.1, Math.min(20, scaleRef.current * factor));
    triggerRender();
  }, [triggerRender]);

  // Mouse drag pan
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    dragStartRef.current = { x: e.clientX - offsetRef.current.x, y: e.clientY - offsetRef.current.y };
  }, []);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragStartRef.current) return;
    offsetRef.current = {
      x: e.clientX - dragStartRef.current.x,
      y: e.clientY - dragStartRef.current.y,
    };
    triggerRender();
  }, [triggerRender]);

  const onMouseUp = useCallback(() => { dragStartRef.current = null; }, []);

  // Touch support
  const lastTouchDistRef = useRef<number | null>(null);
  const lastTouchCenterRef = useRef<{ x: number; y: number } | null>(null);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastTouchDistRef.current = Math.hypot(dx, dy);
      lastTouchCenterRef.current = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
      };
    } else if (e.touches.length === 1) {
      dragStartRef.current = {
        x: e.touches[0].clientX - offsetRef.current.x,
        y: e.touches[0].clientY - offsetRef.current.y,
      };
    }
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    if (e.touches.length === 2 && lastTouchDistRef.current !== null) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const factor = dist / lastTouchDistRef.current;
      scaleRef.current = Math.max(0.1, Math.min(20, scaleRef.current * factor));
      lastTouchDistRef.current = dist;
      triggerRender();
    } else if (e.touches.length === 1 && dragStartRef.current) {
      offsetRef.current = {
        x: e.touches[0].clientX - dragStartRef.current.x,
        y: e.touches[0].clientY - dragStartRef.current.y,
      };
      triggerRender();
    }
  }, [triggerRender]);

  const onTouchEnd = useCallback(() => {
    dragStartRef.current = null;
    lastTouchDistRef.current = null;
  }, []);

  const resetView = () => {
    if (!design || !canvasRef.current) return;
    scaleRef.current = computeAutoScale(design, canvasRef.current.width, canvasRef.current.height);
    offsetRef.current = { x: 0, y: 0 };
    triggerRender();
  };

  const formatMM = (units: number) => (units / 10).toFixed(1);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh", background: "#0f0f1a", color: "#e0e0f0", fontFamily: "system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: "#16162a", borderBottom: "1px solid #2a2a4a" }}>
        <button
          onClick={() => navigate("/")}
          style={{ background: "none", border: "none", color: "#aaa", fontSize: 20, cursor: "pointer", padding: "2px 6px", borderRadius: 6 }}
        >
          ←
        </button>
        <span style={{ fontSize: 18, fontWeight: 700, color: "#c8b4f0" }}>🧵 Xem file thêu</span>
        {design && (
          <span style={{ marginLeft: "auto", fontSize: 12, color: "#888" }}>
            {design.label}
          </span>
        )}
      </div>

      {/* Info bar */}
      {design && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, padding: "8px 16px", background: "#12122a", borderBottom: "1px solid #2a2a4a", fontSize: 13 }}>
          <span>📐 {formatMM(design.width)} × {formatMM(design.height)} mm</span>
          <span>🪡 {design.stitchCount.toLocaleString()} mũi</span>
          <span>🎨 {design.colorCount} màu</span>
          <span style={{ color: "#7a7aaa" }}>{design.format}</span>
          {/* Color swatches */}
          <span style={{ display: "flex", gap: 4, alignItems: "center" }}>
            {design.palette.slice(0, design.colorCount).map((c, i) => (
              <span key={i} style={{ width: 14, height: 14, borderRadius: "50%", background: c, border: "1px solid #444", display: "inline-block" }} title={`Màu ${i + 1}: ${c}`} />
            ))}
          </span>
          <button
            onClick={resetView}
            style={{ marginLeft: "auto", background: "#2a2a4a", border: "none", color: "#c8b4f0", padding: "2px 10px", borderRadius: 6, cursor: "pointer", fontSize: 12 }}
          >
            Khớp màn hình
          </button>
        </div>
      )}

      {/* Main canvas area */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        <canvas
          ref={canvasRef}
          style={{ width: "100%", height: "100%", display: "block", cursor: design ? "grab" : "default", touchAction: "none" }}
          onWheel={onWheel}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        />

        {/* Upload overlay */}
        {!design && !loading && (
          <div
            onDrop={onDrop}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            style={{
              position: "absolute", inset: 0, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: 16,
              background: isDragging ? "rgba(200,180,240,0.08)" : "transparent",
              border: isDragging ? "2px dashed #c8b4f0" : "none",
              transition: "all 0.2s",
            }}
          >
            <div style={{ fontSize: 64 }}>🧵</div>
            <div style={{ fontSize: 22, fontWeight: 600, color: "#c8b4f0" }}>Tải lên file thêu</div>
            <div style={{ fontSize: 14, color: "#888", textAlign: "center", maxWidth: 280, lineHeight: 1.6 }}>
              Kéo thả hoặc chọn file .pes hoặc .dst<br />
              để xem trước thiết kế thêu
            </div>
            <label style={{ cursor: "pointer" }}>
              <input type="file" accept=".pes,.dst" onChange={onFileInput} style={{ display: "none" }} />
              <span style={{ display: "inline-block", padding: "10px 28px", background: "#c8b4f0", color: "#0f0f1a", borderRadius: 8, fontWeight: 700, fontSize: 15 }}>
                Chọn file
              </span>
            </label>
            {error && (
              <div style={{ color: "#ff6b6b", fontSize: 14, maxWidth: 320, textAlign: "center" }}>{error}</div>
            )}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 36, animation: "spin 1s linear infinite" }}>⏳</div>
            <div style={{ color: "#c8b4f0" }}>Đang đọc file...</div>
          </div>
        )}

        {/* Zoom hint */}
        {design && (
          <div style={{ position: "absolute", bottom: 12, right: 12, fontSize: 11, color: "#555", userSelect: "none" }}>
            Cuộn để zoom · Kéo để di chuyển
          </div>
        )}

        {/* Re-upload button when design is loaded */}
        {design && (
          <label style={{ position: "absolute", bottom: 12, left: 12, cursor: "pointer" }}>
            <input type="file" accept=".pes,.dst" onChange={onFileInput} style={{ display: "none" }} />
            <span style={{ display: "inline-block", padding: "6px 14px", background: "#1e1e3a", border: "1px solid #3a3a6a", color: "#c8b4f0", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>
              + Tải file khác
            </span>
          </label>
        )}
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
