import { useState, useMemo } from "react";
import { threads } from "@/data/threads";

const COLUMN_COLORS: Record<string, string> = {
  A: "#f6e96b", B: "#f0a500", C: "#f4a0c0",
  D: "#f07060", E: "#c0202a", K: "#7ab87a",
  L: "#90c090", M: "#a8d0a0", N: "#b0c8c0",
  O: "#c0d0b8", P: "#d0c8a0", Q: "#b08060",
  R: "#90a060", S: "#8090b0", T: "#606080",
};

function getTextColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? "#222222" : "#ffffff";
}

export default function Home() {
  const [query, setQuery] = useState("");
  const [selectedColumn, setSelectedColumn] = useState<string | null>(null);

  const columns = useMemo(() => {
    const cols = new Set(threads.map((t) => t.column));
    return Array.from(cols).sort();
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toUpperCase();
    return threads.filter((t) => {
      const matchQuery = !q || t.code.toUpperCase().includes(q);
      const matchCol = !selectedColumn || t.column === selectedColumn;
      return matchQuery && matchCol;
    });
  }, [query, selectedColumn]);

  const exactMatch = results.length === 1 || (query && results.find((t) => t.code.toUpperCase() === query.toUpperCase()));

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-green-600 flex items-center justify-center">
            <span className="text-white text-xs font-bold">G</span>
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900 leading-tight">Tra Cứu Chỉ Thêu Gingko</h1>
            <p className="text-xs text-gray-500">Gingko Brand High-Grade Embroidery Thread</p>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-6 flex flex-col gap-5">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 flex flex-col gap-3">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nhập mã màu (vd: G622, 5860...)"
            className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100 transition"
            autoFocus
          />

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedColumn(null)}
              className={`px-3 py-1 rounded-full text-sm font-medium border transition ${
                selectedColumn === null
                  ? "bg-green-600 text-white border-green-600"
                  : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
              }`}
            >
              Tất cả
            </button>
            {columns.map((col) => (
              <button
                key={col}
                onClick={() => setSelectedColumn(selectedColumn === col ? null : col)}
                className={`px-3 py-1 rounded-full text-sm font-bold border transition ${
                  selectedColumn === col
                    ? "ring-2 ring-offset-1 ring-green-500"
                    : "hover:opacity-80"
                }`}
                style={{
                  backgroundColor: COLUMN_COLORS[col] ?? "#e0e0e0",
                  color: getTextColor(COLUMN_COLORS[col] ?? "#e0e0e0"),
                  borderColor: COLUMN_COLORS[col] ?? "#e0e0e0",
                }}
              >
                {col}
              </button>
            ))}
          </div>
        </div>

        {query && exactMatch && typeof exactMatch === "object" && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-2 font-medium uppercase tracking-wide">Kết quả chính xác</p>
            <div className="flex items-center gap-4">
              <div
                className="w-20 h-20 rounded-xl shadow-md flex-shrink-0 border border-gray-100"
                style={{ backgroundColor: exactMatch.hex ?? COLUMN_COLORS[exactMatch.column] ?? "#ccc" }}
              />
              <div>
                <p className="text-2xl font-bold text-gray-900">{exactMatch.code}</p>
                <p className="text-gray-500 text-sm mt-1">Cột <strong>{exactMatch.column}</strong></p>
                {exactMatch.hex && (
                  <p className="text-xs text-gray-400 font-mono mt-1">{exactMatch.hex.toUpperCase()}</p>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">
              {results.length} kết quả{selectedColumn ? ` trong cột ${selectedColumn}` : ""}
            </span>
            {results.length < threads.length && (
              <button
                onClick={() => { setQuery(""); setSelectedColumn(null); }}
                className="text-xs text-green-600 hover:underline"
              >
                Xóa bộ lọc
              </button>
            )}
          </div>

          {results.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              <p className="text-lg">Không tìm thấy mã "<strong>{query}</strong>"</p>
              <p className="text-sm mt-1">Hãy thử mã khác hoặc kiểm tra lại chính tả</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50 max-h-[500px] overflow-y-auto">
              {results.map((t) => (
                <div key={`${t.column}-${t.code}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition">
                  <div
                    className="w-10 h-7 rounded-md flex-shrink-0 border border-gray-100"
                    style={{ backgroundColor: t.hex ?? COLUMN_COLORS[t.column] ?? "#ccc" }}
                  />
                  <span className="font-semibold text-gray-900 flex-1 text-sm">{t.code}</span>
                  <span
                    className="text-xs font-bold px-2 py-0.5 rounded-full"
                    style={{
                      backgroundColor: COLUMN_COLORS[t.column] ?? "#e0e0e0",
                      color: getTextColor(COLUMN_COLORS[t.column] ?? "#e0e0e0"),
                    }}
                  >
                    {t.column}
                  </span>
                  {t.hex && (
                    <span className="text-xs text-gray-400 font-mono hidden sm:block w-16 text-right">
                      {t.hex.toUpperCase()}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      <footer className="text-center text-xs text-gray-400 py-4">
        Gingko Brand — 100% Polyester — {threads.length} màu
      </footer>
    </div>
  );
}
