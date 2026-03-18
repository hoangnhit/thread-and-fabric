import { useState, useRef, useEffect, useCallback } from "react";
import { threadColors, rows, type ThreadColor } from "@/data/threads";

// Natural image dimensions (after EXIF rotation)
const IMG_W = 1280;
const IMG_H = 960;

// Y-center of each row swatch in natural pixels
const ROW_Y: Record<string, number> = {
  O: 107,
  N: 269,
  M: 421,
  L: 587,
  K: 747,
};

// Height (natural px) to show above/below each row center
const ROW_HALF_H = 80;

// Swatch X bounds in natural pixels (exclude side labels)
const SWATCH_X1 = 355;
const SWATCH_X2 = 1140;
const SWATCH_COUNT = 20;

const ROW_LABEL: Record<string, string> = {
  O: "Hàng O",
  N: "Hàng N",
  M: "Hàng M",
  L: "Hàng L",
  K: "Hàng K",
};

// Strip display height in px
const STRIP_H = 160;

function hexToRgb(hex: string) {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

function colorDist(hex1: string, hex2: string) {
  const a = hexToRgb(hex1), b = hexToRgb(hex2);
  return Math.sqrt((a.r-b.r)**2 + (a.g-b.g)**2 + (a.b-b.b)**2);
}

interface SelInfo { thread: ThreadColor; row: string; idx: number }

export default function Home() {
  const [search, setSearch] = useState("");
  const [activeRow, setActiveRow] = useState("all");
  const [selected, setSelected] = useState<SelInfo | null>(null);
  const [imgLoaded, setImgLoaded] = useState(false);

  // For full-image picker
  const [pickerMode, setPickerMode] = useState(false);
  const [pickedHex, setPickedHex] = useState<string | null>(null);
  const [pickedPos, setPickedPos] = useState<{ x: number; y: number } | null>(null);
  const [closest, setClosest] = useState<Array<ThreadColor & { dist: number }>>([]);

  const sourceImgRef = useRef<HTMLImageElement>(null);
  const fullCanvasRef = useRef<HTMLCanvasElement>(null);
  // One canvas ref per row
  const rowCanvases = useRef<Record<string, HTMLCanvasElement | null>>({});

  const drawRowCanvas = useCallback((row: string) => {
    const canvas = rowCanvases.current[row];
    const img = sourceImgRef.current;
    if (!canvas || !img || !img.complete) return;
    const W = canvas.offsetWidth;
    if (W === 0) return;
    canvas.width = W;
    canvas.height = STRIP_H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const srcX = SWATCH_X1;
    const srcY = ROW_Y[row] - ROW_HALF_H;
    const srcW = SWATCH_X2 - SWATCH_X1;
    const srcH = ROW_HALF_H * 2;
    ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, W, STRIP_H);
  }, []);

  const drawAllRows = useCallback(() => {
    rows.forEach(drawRowCanvas);
  }, [drawRowCanvas]);

  const drawFullCanvas = useCallback(() => {
    const c = fullCanvasRef.current;
    const img = sourceImgRef.current;
    if (!c || !img) return;
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    c.getContext("2d")?.drawImage(img, 0, 0);
  }, []);

  useEffect(() => {
    if (!imgLoaded) return;
    drawAllRows();
    drawFullCanvas();
    const onResize = () => drawAllRows();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [imgLoaded, drawAllRows, drawFullCanvas]);

  // Re-draw when activeRow changes (row sections mount/unmount)
  useEffect(() => {
    if (!imgLoaded) return;
    setTimeout(drawAllRows, 50);
  }, [activeRow, imgLoaded, drawAllRows]);

  const searchTrim = search.trim().toLowerCase();
  const matchExact = threadColors.find(t => t.code.toLowerCase() === searchTrim);
  const displayRows = activeRow === "all" ? rows : [activeRow];

  function handleRowClick(e: React.MouseEvent<HTMLCanvasElement>, row: string, rowColors: ThreadColor[]) {
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    const idx = Math.min(SWATCH_COUNT - 1, Math.max(0, Math.floor(relX / rect.width * SWATCH_COUNT)));
    if (idx >= rowColors.length) return;
    const thread = rowColors[idx];
    setSelected({ thread, row, idx });
    setSearch(thread.code);
  }

  function handleFullCanvasPick(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!pickerMode) return;
    const canvas = fullCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) * canvas.width / rect.width);
    const y = Math.floor((e.clientY - rect.top) * canvas.height / rect.height);
    const px = canvas.getContext("2d")!.getImageData(x, y, 1, 1).data;
    const hex = `#${px[0].toString(16).padStart(2,"0")}${px[1].toString(16).padStart(2,"0")}${px[2].toString(16).padStart(2,"0")}`;
    setPickedHex(hex);
    setPickedPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    setClosest(threadColors.map(t => ({ ...t, dist: colorDist(hex, t.hex) })).sort((a,b) => a.dist - b.dist).slice(0, 5));
  }

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
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input
              type="text"
              placeholder="Tìm mã chỉ (G578, G904...)"
              value={search}
              onChange={e => { setSearch(e.target.value); setSelected(null); }}
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 bg-white"
            />
          </div>
          <div className="flex gap-1">
            {["all", ...rows].map(r => (
              <button key={r} onClick={() => setActiveRow(r)}
                className={`px-3 py-1 text-xs rounded-full font-semibold border transition-colors ${activeRow === r ? "bg-green-700 text-white border-green-700" : "bg-white text-gray-600 border-gray-300 hover:border-green-400"}`}>
                {r === "all" ? "Tất cả" : r}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Hidden source image — loaded once for all canvases */}
      <img
        ref={sourceImgRef}
        src="/thread-color/thread-chart.png"
        alt=""
        className="hidden"
        onLoad={() => setImgLoaded(true)}
      />

      <div className="max-w-5xl mx-auto px-4 py-5 space-y-5">

        {/* Exact search match */}
        {matchExact && (
          <div className="bg-white rounded-xl shadow-sm border border-green-200 p-4 flex items-center gap-4">
            <div className="w-16 h-16 rounded-xl shadow border border-black/10 shrink-0" style={{ backgroundColor: matchExact.hex }} />
            <div>
              <p className="text-xl font-bold text-gray-900">{matchExact.code}</p>
              <p className="text-sm text-gray-500">Hàng {matchExact.row}</p>
              <p className="font-mono text-sm text-green-700 font-semibold mt-0.5">{matchExact.hex.toUpperCase()}</p>
            </div>
          </div>
        )}

        {/* Row strips */}
        {displayRows.map(row => {
          const rowColors = threadColors.filter(t => t.row === row);
          const isSel = selected?.row === row;

          return (
            <section key={row} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-4 py-2 border-b border-gray-100 flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-800">{ROW_LABEL[row]}</span>
                <span className="text-xs text-gray-400">{rowColors.length} màu · nhấp vào ô để tra cứu</span>
              </div>

              {/* Cropped swatch canvas */}
              <canvas
                ref={el => { rowCanvases.current[row] = el; if (el && imgLoaded) drawRowCanvas(row); }}
                style={{ width: "100%", height: STRIP_H, display: "block", cursor: "pointer" }}
                onClick={e => handleRowClick(e, row, rowColors)}
                title="Nhấp vào ô màu để tra mã"
              />

              {/* Thread code labels — evenly spaced under the canvas */}
              <div className="relative overflow-hidden" style={{ height: 26 }}>
                {rowColors.map((t, idx) => {
                  const centerPct = (idx + 0.5) / SWATCH_COUNT * 100;
                  const isSearchMatch = searchTrim && t.code.toLowerCase().includes(searchTrim);
                  const isSelected = isSel && selected?.idx === idx;
                  return (
                    <button
                      key={t.code}
                      onClick={() => { setSelected({ thread: t, row, idx }); setSearch(t.code); }}
                      className="absolute top-0 -translate-x-1/2 pt-1"
                      style={{ left: `${centerPct}%` }}
                      title={t.code}
                    >
                      <span className={`text-[9px] font-medium whitespace-nowrap leading-none ${
                        isSelected ? "text-green-700 font-bold" :
                        isSearchMatch ? "text-yellow-600 font-bold" :
                        "text-gray-500"
                      }`}>
                        {t.code}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Selected thread detail */}
              {isSel && selected && (
                <div className="mx-4 mb-4 mt-1 rounded-xl border border-green-200 bg-green-50 p-3 flex items-center gap-3">
                  <div className="w-12 h-12 rounded-lg border border-black/10 shadow shrink-0" style={{ backgroundColor: selected.thread.hex }} />
                  <div>
                    <p className="font-bold text-gray-900 text-base">{selected.thread.code}</p>
                    <p className="text-xs text-gray-500">Hàng {selected.thread.row} · Vị trí {selected.idx + 1}/{SWATCH_COUNT}</p>
                    <p className="font-mono text-sm text-green-700 font-semibold">{selected.thread.hex.toUpperCase()}</p>
                  </div>
                  <button onClick={() => setSelected(null)} className="ml-auto text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
                </div>
              )}
            </section>
          );
        })}

        {/* Full-image picker */}
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
            <canvas
              ref={fullCanvasRef}
              onClick={handleFullCanvasPick}
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
