import { useState, useRef, useCallback, useEffect } from "react";
import { threadColors, rows, rowLabels, type ThreadColor } from "@/data/threads";

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
    Math.pow(c1.r - c2.r, 2) +
    Math.pow(c1.g - c2.g, 2) +
    Math.pow(c1.b - c2.b, 2)
  );
}

function getContrastColor(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  const luma = 0.299 * r + 0.587 * g + 0.114 * b;
  return luma > 140 ? "#000000" : "#ffffff";
}

export default function Home() {
  const [search, setSearch] = useState("");
  const [selectedRow, setSelectedRow] = useState<string>("all");
  const [pickedColor, setPickedColor] = useState<string | null>(null);
  const [pickedPosition, setPickedPosition] = useState<{ x: number; y: number } | null>(null);
  const [closestThreads, setClosestThreads] = useState<Array<ThreadColor & { distance: number }>>([]);
  const [hoveredCode, setHoveredCode] = useState<string | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [isPickerMode, setIsPickerMode] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const filteredColors = threadColors.filter((t) => {
    const matchesSearch = search === "" || t.code.toLowerCase().includes(search.toLowerCase());
    const matchesRow = selectedRow === "all" || t.row === selectedRow;
    return matchesSearch && matchesRow;
  });

  const drawImageOnCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(img, 0, 0);
  }, []);

  const pickColorFromCanvas = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isPickerMode) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = Math.floor((e.clientX - rect.left) * scaleX);
    const y = Math.floor((e.clientY - rect.top) * scaleY);

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const pixel = ctx.getImageData(x, y, 1, 1).data;
    const hex = `#${pixel[0].toString(16).padStart(2, "0")}${pixel[1].toString(16).padStart(2, "0")}${pixel[2].toString(16).padStart(2, "0")}`;
    setPickedColor(hex);
    setPickedPosition({ x: e.clientX - rect.left, y: e.clientY - rect.top });

    const sorted = threadColors
      .map((t) => ({ ...t, distance: colorDistance(hex, t.hex) }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 5);
    setClosestThreads(sorted);
  }, [isPickerMode]);

  return (
    <div className="min-h-screen bg-[#f5f7f5] font-sans">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-green-600 flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
            </div>
            <div>
              <h1 className="text-base font-bold text-gray-900 leading-tight">Gingko Thread Color</h1>
              <p className="text-xs text-gray-500 leading-tight">Tra cứu màu chỉ thêu</p>
            </div>
          </div>

          {/* Search */}
          <div className="flex-1 min-w-[180px] max-w-sm relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            <input
              type="text"
              placeholder="Tìm mã chỉ (VD: G578, G904...)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 bg-white"
            />
          </div>

          {/* Row filter */}
          <div className="flex gap-1 flex-wrap">
            <button
              onClick={() => setSelectedRow("all")}
              className={`px-3 py-1 text-xs rounded-full font-medium border transition-colors ${selectedRow === "all" ? "bg-green-600 text-white border-green-600" : "bg-white text-gray-600 border-gray-300 hover:border-green-400"}`}
            >
              Tất cả
            </button>
            {rows.map((r) => (
              <button
                key={r}
                onClick={() => setSelectedRow(r)}
                className={`px-3 py-1 text-xs rounded-full font-medium border transition-colors ${selectedRow === r ? "bg-green-600 text-white border-green-600" : "bg-white text-gray-600 border-gray-300 hover:border-green-400"}`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-8">

        {/* Image Picker Section */}
        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="font-semibold text-gray-800 text-sm">Bảng màu chỉ thêu Gingko</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {isPickerMode ? "🎯 Đang chọn màu – Nhấp vào bất kỳ ô màu nào để tra cứu" : "Bật chế độ chọn màu để nhấp vào hình và tìm chỉ tương đương"}
              </p>
            </div>
            <button
              onClick={() => {
                setIsPickerMode((v) => !v);
                setPickedColor(null);
                setClosestThreads([]);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                isPickerMode
                  ? "bg-green-600 text-white border-green-600 shadow-md"
                  : "bg-white text-gray-700 border-gray-300 hover:border-green-400 hover:text-green-700"
              }`}
            >
              <span>{isPickerMode ? "✅" : "🎨"}</span>
              {isPickerMode ? "Đang chọn màu..." : "Chọn màu từ hình"}
            </button>
          </div>

          <div className="relative">
            {/* Hidden real image for loading */}
            <img
              ref={imgRef}
              src="/thread-color/thread-chart.png"
              alt="Gingko Thread Color Chart"
              className="hidden"
              onLoad={() => {
                setImageLoaded(true);
                drawImageOnCanvas();
              }}
            />

            {/* Canvas for pixel picking */}
            <canvas
              ref={canvasRef}
              onClick={pickColorFromCanvas}
              className={`w-full block ${isPickerMode ? "cursor-crosshair" : "cursor-default"}`}
              style={{ display: imageLoaded ? "block" : "none" }}
            />

            {/* Fallback image (non-picker mode) */}
            {!imageLoaded && (
              <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
                Đang tải hình ảnh...
              </div>
            )}

            {/* Picked color indicator */}
            {isPickerMode && pickedColor && pickedPosition && (
              <div
                className="absolute pointer-events-none"
                style={{ left: pickedPosition.x + 10, top: pickedPosition.y - 30 }}
              >
                <div
                  className="w-8 h-8 rounded-full border-4 border-white shadow-lg"
                  style={{ backgroundColor: pickedColor }}
                />
              </div>
            )}
          </div>

          {/* Closest threads result */}
          {closestThreads.length > 0 && pickedColor && (
            <div className="px-5 py-4 border-t border-gray-100 bg-gray-50">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg border-2 border-white shadow" style={{ backgroundColor: pickedColor }} />
                <div>
                  <p className="text-sm font-semibold text-gray-800">Màu đã chọn: <code className="font-mono text-green-700">{pickedColor.toUpperCase()}</code></p>
                  <p className="text-xs text-gray-500">Chỉ thêu gần nhất:</p>
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                {closestThreads.map((t, i) => (
                  <div
                    key={t.code}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${i === 0 ? "border-green-400 bg-green-50" : "border-gray-200 bg-white"}`}
                  >
                    <div className="w-7 h-7 rounded-md shadow-sm flex-shrink-0 border border-white" style={{ backgroundColor: t.hex }} />
                    <div>
                      <p className="text-xs font-bold text-gray-800">{t.code}</p>
                      <p className="text-xs text-gray-500">Hàng {t.row} {i === 0 ? "✓ Gần nhất" : ""}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Color Grid per row */}
        {(selectedRow === "all" ? rows : [selectedRow]).map((row) => {
          const rowColors = filteredColors.filter((t) => t.row === row);
          if (rowColors.length === 0) return null;
          return (
            <section key={row} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100">
                <h2 className="font-semibold text-gray-800 text-sm">{rowLabels[row]}</h2>
                <p className="text-xs text-gray-500 mt-0.5">{rowColors.length} màu</p>
              </div>
              <div className="p-4">
                <div className="flex flex-wrap gap-2">
                  {rowColors.map((t) => (
                    <div
                      key={t.code}
                      className={`group relative flex flex-col items-center cursor-pointer transition-transform hover:scale-110 hover:z-10 ${hoveredCode === t.code ? "scale-110 z-10" : ""}`}
                      onMouseEnter={() => setHoveredCode(t.code)}
                      onMouseLeave={() => setHoveredCode(null)}
                      onClick={() => {
                        setSearch(t.code);
                        setSelectedRow("all");
                      }}
                    >
                      {/* Color swatch */}
                      <div
                        className="w-10 h-14 rounded-md shadow-sm border border-black/10 flex items-end justify-center pb-1"
                        style={{ backgroundColor: t.hex }}
                      >
                        <span
                          className="text-[9px] font-bold leading-tight text-center px-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                          style={{ color: getContrastColor(t.hex) }}
                        >
                          {t.code}
                        </span>
                      </div>
                      {/* Code label */}
                      <span className="text-[9px] text-gray-600 mt-1 font-medium text-center w-10 truncate">{t.code}</span>

                      {/* Tooltip */}
                      {hoveredCode === t.code && (
                        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 whitespace-nowrap shadow-xl z-50 pointer-events-none">
                          <div className="font-bold">{t.code}</div>
                          <div className="text-gray-300">Hàng {t.row}</div>
                          <div className="font-mono text-green-400">{t.hex.toUpperCase()}</div>
                          <div
                            className="w-full h-4 rounded mt-1 border border-white/20"
                            style={{ backgroundColor: t.hex }}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </section>
          );
        })}

        {filteredColors.length === 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
            <div className="text-4xl mb-3">🔍</div>
            <p className="text-gray-500 font-medium">Không tìm thấy mã chỉ "<span className="text-gray-800">{search}</span>"</p>
            <p className="text-gray-400 text-sm mt-1">Thử tìm với mã khác hoặc chọn hàng khác</p>
            <button onClick={() => { setSearch(""); setSelectedRow("all"); }} className="mt-4 text-sm text-green-600 underline">Xóa bộ lọc</button>
          </div>
        )}
      </div>

      <footer className="text-center py-6 text-xs text-gray-400">
        Gingko Brand High-Grade Embroidery Thread · 100% Polyester
      </footer>
    </div>
  );
}
