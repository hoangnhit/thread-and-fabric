import { useState, useRef, useCallback, useEffect } from "react";
import { threadColors, rows, type ThreadColor } from "@/data/threads";

// Natural image dimensions (after EXIF rotation)
const IMG_W = 1280;
const IMG_H = 960;

// Y-center of each row in natural pixels
const ROW_Y: Record<string, number> = {
  O: 107,
  N: 269,
  M: 421,
  L: 587,
  K: 747,
};

// Row label names
const ROW_LABEL: Record<string, string> = {
  O: "Hàng O",
  N: "Hàng N",
  M: "Hàng M",
  L: "Hàng L",
  K: "Hàng K",
};

// Swatch X bounds in natural pixels (skip the "100% Polyester" label on right)
const SWATCH_X1 = 358;
const SWATCH_X2 = 1138;

// Height of each row strip shown in the UI (display pixels)
const STRIP_H = 110;

function hexToRgb(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
}

function colorDistance(hex1: string, hex2: string) {
  const c1 = hexToRgb(hex1);
  const c2 = hexToRgb(hex2);
  return Math.sqrt(
    (c1.r - c2.r) ** 2 + (c1.g - c2.g) ** 2 + (c1.b - c2.b) ** 2
  );
}

function getContrast(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  return 0.299 * r + 0.587 * g + 0.114 * b > 140 ? "#000" : "#fff";
}

// Map a click X position (in a container of width W) to a swatch index (0–19)
function xToSwatchIndex(relX: number, containerW: number): number {
  const scale = containerW / IMG_W;
  const x1 = SWATCH_X1 * scale;
  const x2 = SWATCH_X2 * scale;
  if (relX < x1 || relX > x2) return -1;
  const idx = Math.floor(((relX - x1) / (x2 - x1)) * 20);
  return Math.min(19, Math.max(0, idx));
}

interface SelectedInfo {
  thread: ThreadColor;
  row: string;
  idx: number;
}

export default function Home() {
  const [search, setSearch] = useState("");
  const [activeRow, setActiveRow] = useState<string>("all");
  const [selected, setSelected] = useState<SelectedInfo | null>(null);
  const [pickerRow, setPickerRow] = useState<string | null>(null);
  const [pickedHex, setPickedHex] = useState<string | null>(null);
  const [closest, setClosest] = useState<Array<ThreadColor & { dist: number }>>([]);

  // For full-image pixel picker
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [pickerMode, setPickerMode] = useState(false);
  const [pickedPos, setPickedPos] = useState<{ x: number; y: number } | null>(null);

  const drawCanvas = useCallback(() => {
    const c = canvasRef.current;
    const img = imgRef.current;
    if (!c || !img) return;
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    c.getContext("2d")?.drawImage(img, 0, 0);
  }, []);

  const filteredRows = activeRow === "all" ? rows : [activeRow];

  // Search filter: highlight matching thread
  const searchMatch = search.trim().toLowerCase();
  const matchingCode = threadColors.find(
    (t) => t.code.toLowerCase() === searchMatch
  );

  function handleStripClick(
    e: React.MouseEvent<HTMLDivElement>,
    row: string,
    rowColors: ThreadColor[]
  ) {
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const relX = e.clientX - rect.left;
    const containerW = rect.width;
    const idx = xToSwatchIndex(relX, containerW);
    if (idx < 0 || idx >= rowColors.length) return;
    const thread = rowColors[idx];
    setSelected({ thread, row, idx });
    setSearch(thread.code);
  }

  function handleCanvasPick(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!pickerMode) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = Math.floor((e.clientX - rect.left) * scaleX);
    const y = Math.floor((e.clientY - rect.top) * scaleY);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const px = ctx.getImageData(x, y, 1, 1).data;
    const hex = `#${px[0].toString(16).padStart(2, "0")}${px[1].toString(16).padStart(2, "0")}${px[2].toString(16).padStart(2, "0")}`;
    setPickedHex(hex);
    setPickedPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    const sorted = threadColors
      .map((t) => ({ ...t, dist: colorDistance(hex, t.hex) }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 5);
    setClosest(sorted);
  }

  const displayRows = filteredRows.filter((r) => {
    const rowColors = threadColors.filter((t) => t.row === r);
    if (searchMatch) return rowColors.some((t) => t.code.toLowerCase().includes(searchMatch));
    return true;
  });

  return (
    <div className="min-h-screen bg-[#f4f6f4] font-sans">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-8 h-8 rounded-full bg-green-700 flex items-center justify-center text-white font-bold text-sm">G</div>
            <div>
              <h1 className="text-sm font-bold text-gray-900 leading-tight">Gingko Thread Color</h1>
              <p className="text-[11px] text-gray-400 leading-tight">Tra cứu màu chỉ thêu</p>
            </div>
          </div>

          <div className="flex-1 min-w-[160px] max-w-xs relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            <input
              type="text"
              placeholder="Tìm mã chỉ (G578, G904...)"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setSelected(null); }}
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 bg-white"
            />
          </div>

          <div className="flex gap-1">
            {["all", ...rows].map((r) => (
              <button
                key={r}
                onClick={() => setActiveRow(r)}
                className={`px-3 py-1 text-xs rounded-full font-semibold border transition-colors ${activeRow === r ? "bg-green-700 text-white border-green-700" : "bg-white text-gray-600 border-gray-300 hover:border-green-400"}`}
              >
                {r === "all" ? "Tất cả" : r}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-5 space-y-5">

        {/* Search result highlight */}
        {matchingCode && (
          <div className="bg-white rounded-xl shadow-sm border border-green-200 p-4 flex items-center gap-4">
            <div
              className="w-16 h-16 rounded-xl shadow border border-black/10 shrink-0"
              style={{ backgroundColor: matchingCode.hex }}
            />
            <div>
              <p className="text-lg font-bold text-gray-900">{matchingCode.code}</p>
              <p className="text-sm text-gray-500">Hàng {matchingCode.row}</p>
              <p className="font-mono text-sm text-green-700 font-semibold mt-0.5">{matchingCode.hex.toUpperCase()}</p>
            </div>
          </div>
        )}

        {/* Per-row image strips */}
        {displayRows.map((row) => {
          const rowColors = threadColors.filter((t) => t.row === row);
          const visibleColors = searchMatch
            ? rowColors.filter((t) => t.code.toLowerCase().includes(searchMatch))
            : rowColors;

          // object-position Y percent to center on the row
          const yPct = ((ROW_Y[row] / IMG_H) * 100).toFixed(1);

          // Swatch label positions: from SWATCH_X1/IMG_W to SWATCH_X2/IMG_W, evenly spaced 20 items
          const x1Pct = (SWATCH_X1 / IMG_W) * 100;
          const x2Pct = (SWATCH_X2 / IMG_W) * 100;
          const step = (x2Pct - x1Pct) / 20;

          return (
            <section key={row} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              {/* Row header */}
              <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-800">{ROW_LABEL[row]}</span>
                <span className="text-xs text-gray-400">{rowColors.length} màu</span>
              </div>

              {/* Image strip — cropped to this row */}
              <div
                className="relative w-full cursor-pointer select-none"
                style={{ height: STRIP_H }}
                onClick={(e) => handleStripClick(e, row, rowColors)}
                title="Nhấp vào ô màu để tra cứu"
              >
                <img
                  src="/thread-color/thread-chart.png"
                  alt={`Hàng ${row}`}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    objectPosition: `center ${yPct}%`,
                    display: "block",
                    pointerEvents: "none",
                  }}
                />

                {/* Hover overlay hint */}
                <div className="absolute inset-0 bg-transparent hover:bg-black/5 transition-colors" />

                {/* Highlight selected swatch */}
                {selected && selected.row === row && (
                  <div
                    className="absolute top-0 bottom-0 border-2 border-white shadow-lg"
                    style={{
                      left: `${x1Pct + selected.idx * step}%`,
                      width: `${step}%`,
                      boxSizing: "border-box",
                      outline: "2px solid #16a34a",
                    }}
                  />
                )}

                {/* Highlight search match */}
                {searchMatch && rowColors.map((t, idx) =>
                  t.code.toLowerCase().includes(searchMatch) ? (
                    <div
                      key={t.code}
                      className="absolute top-0 bottom-0 border-2 border-yellow-400 shadow-lg pointer-events-none"
                      style={{
                        left: `${x1Pct + idx * step}%`,
                        width: `${step}%`,
                        boxSizing: "border-box",
                      }}
                    />
                  ) : null
                )}
              </div>

              {/* Thread code labels below the strip — aligned to swatches */}
              <div className="relative" style={{ height: 28 }}>
                {rowColors.map((t, idx) => {
                  const centerPct = x1Pct + idx * step + step / 2;
                  const isMatch = searchMatch && t.code.toLowerCase().includes(searchMatch);
                  const isSel = selected?.row === row && selected?.idx === idx;
                  return (
                    <button
                      key={t.code}
                      onClick={() => {
                        setSelected({ thread: t, row, idx });
                        setSearch(t.code);
                      }}
                      title={t.code}
                      className="absolute top-0 transform -translate-x-1/2 flex flex-col items-center"
                      style={{ left: `${centerPct}%`, paddingTop: 4 }}
                    >
                      <span
                        className={`text-[9px] font-medium leading-none whitespace-nowrap ${
                          isMatch ? "text-yellow-600 font-bold" :
                          isSel ? "text-green-700 font-bold" :
                          "text-gray-500"
                        }`}
                      >
                        {t.code}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Selected thread info */}
              {selected && selected.row === row && (
                <div className="mx-4 mb-4 mt-1 rounded-xl border border-green-200 bg-green-50 p-3 flex items-center gap-3">
                  <div
                    className="w-12 h-12 rounded-lg border border-black/10 shadow shrink-0"
                    style={{ backgroundColor: selected.thread.hex }}
                  />
                  <div>
                    <p className="font-bold text-gray-900 text-base">{selected.thread.code}</p>
                    <p className="text-xs text-gray-500">Hàng {selected.thread.row} · Vị trí {selected.idx + 1}/20</p>
                    <p className="font-mono text-sm text-green-700 font-semibold">{selected.thread.hex.toUpperCase()}</p>
                  </div>
                  <button
                    onClick={() => setSelected(null)}
                    className="ml-auto text-gray-400 hover:text-gray-600 text-lg"
                  >×</button>
                </div>
              )}
            </section>
          );
        })}

        {displayRows.length === 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
            <p className="text-gray-500">Không tìm thấy mã chỉ "<span className="font-semibold text-gray-800">{search}</span>"</p>
            <button onClick={() => { setSearch(""); setSelected(null); }} className="mt-3 text-sm text-green-600 underline">Xóa tìm kiếm</button>
          </div>
        )}

        {/* Full-image pixel picker */}
        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-800">Chọn màu từ hình gốc</p>
              <p className="text-xs text-gray-400">{pickerMode ? "🎯 Nhấp vào bất kỳ ô nào để tra chỉ tương đương" : "Bật để nhấp vào ảnh và tìm mã chỉ gần nhất"}</p>
            </div>
            <button
              onClick={() => { setPickerMode(v => !v); setPickedHex(null); setClosest([]); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${pickerMode ? "bg-green-700 text-white border-green-700" : "bg-white text-gray-700 border-gray-300 hover:border-green-400"}`}
            >
              {pickerMode ? "✅ Đang chọn..." : "🎨 Chọn màu"}
            </button>
          </div>
          <div className="relative">
            <img ref={imgRef} src="/thread-color/thread-chart.png" alt="" className="hidden" onLoad={() => { setImgLoaded(true); drawCanvas(); }} />
            <canvas
              ref={canvasRef}
              onClick={handleCanvasPick}
              className={`w-full block ${pickerMode ? "cursor-crosshair" : "cursor-default"}`}
              style={{ display: imgLoaded ? "block" : "none" }}
            />
            {!imgLoaded && <div className="h-40 flex items-center justify-center text-gray-400 text-sm">Đang tải...</div>}
            {pickerMode && pickedHex && pickedPos && (
              <div className="absolute pointer-events-none" style={{ left: pickedPos.x + 12, top: pickedPos.y - 28 }}>
                <div className="w-7 h-7 rounded-full border-4 border-white shadow-lg" style={{ backgroundColor: pickedHex }} />
              </div>
            )}
          </div>
          {closest.length > 0 && pickedHex && (
            <div className="px-4 py-3 border-t border-gray-100 bg-gray-50">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 rounded-lg border border-white shadow" style={{ backgroundColor: pickedHex }} />
                <p className="text-sm font-semibold text-gray-800">Màu chọn: <code className="font-mono text-green-700">{pickedHex.toUpperCase()}</code></p>
              </div>
              <div className="flex gap-2 flex-wrap">
                {closest.map((t, i) => (
                  <div key={t.code} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl border ${i === 0 ? "border-green-400 bg-green-50" : "border-gray-200 bg-white"}`}>
                    <div className="w-6 h-6 rounded shadow-sm border border-black/10" style={{ backgroundColor: t.hex }} />
                    <div>
                      <p className="text-xs font-bold text-gray-800">{t.code}</p>
                      <p className="text-[10px] text-gray-400">Hàng {t.row}{i === 0 ? " · Gần nhất" : ""}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>

      <footer className="text-center py-5 text-xs text-gray-400">
        Gingko Brand High-Grade Embroidery Thread · 100% Polyester
      </footer>
    </div>
  );
}
