import { useState, useRef, useEffect } from "react";

const CHART_CONFIG = {
  ae: { imageW: 1158, imageH: 1280, topY: 35, rowH: 62, rotateDeg: 0, boxW: 78 },
  pt: { imageW: 960,  imageH: 1280, topY: 215, rowH: 52, rotateDeg: 0, boxW: 65 },
};

function rowYPct(chartId: "ae" | "pt", i: number): number {
  const { topY, rowH, imageH } = CHART_CONFIG[chartId];
  return (topY + (i + 0.5) * rowH) / imageH;
}

const CHARTS = [
  {
    id: "ae" as const,
    file: "/thread-chart-ae.jpg",
    label: "Bảng A – E",
    columns: [
      { name: "A", xPct: 0.045, codes: ["G622","G661","G561","G666","G866","G861","G727","G735","G626","9003","5860","G683","G623","G924","G980","G724","G971","9001","G024","G624"] },
      { name: "B", xPct: 0.240, codes: ["G826","G755","5695","G771","5766","G955","G172","5763","G951","G725","G772","G625","G869","G763","G765","G778","G965","G678","9072","G987"] },
      { name: "C", xPct: 0.438, codes: ["G713","G818","G816","9030","G915","G815","G549","G819","5675","G948","G921","G548","G994","G721","G584","G990","G754","G734","G910","G993"] },
      { name: "D", xPct: 0.638, codes: ["G653","G882","G853","G752","G820","G817","G620","G777","G616","G952","G521","G621","5767","G588","G779","G919","G917","G508","5732","G984"] },
      { name: "E", xPct: 0.835, codes: ["G878","G509","G637","5566","G839","G838","G747","5629","00344","G681","G707","G986","G639","G786","G821","G781","G899","5634","G782","G783"] },
    ],
  },
  {
    id: "pt" as const,
    file: "/thread-chart-pt.jpg",
    label: "Bảng P – T",
    columns: [
      { name: "P", xPct: 0.078, codes: ["G554","G723","G927","5776","G060","G938","G660","G573","G656","G926","9132","G527","G855","G884","G556","9086","G885","G729","G854","G736"] },
      { name: "Q", xPct: 0.255, codes: ["G526","G670","G870","G673","G538","G792","G791","G672","G726","G753","G773","G856","G898","G657","G973","G857","5788","G942","G658","G858"] },
      { name: "R", xPct: 0.432, codes: ["G686","G949","G822","G582","G682","G863","G738","G860","G535","G862","G728","G928","G730","G906","G758","G565","G958","G945","G654","5551"] },
      { name: "S", xPct: 0.609, codes: ["G592","G563","G687","G610","G810","G886","G811","G505","G718","G812","G611","5783","G545","O0939","G761","G613","G612","G212","G918","G572"] },
      { name: "T", xPct: 0.781, codes: ["O0919","G575","G615","G502","G840","G614","G740","G618","G689","G539","G662","G936","G741","G664","G619","G640","G544","G841","G760","G540"] },
    ],
  },
];

type Hit = { chartId: "ae" | "pt"; col: string; row: number; code: string };

function findCode(query: string): Hit | null {
  const q = query.trim().toUpperCase();
  if (!q) return null;
  for (const chart of CHARTS) {
    for (const col of chart.columns) {
      const row = col.codes.findIndex((c) => c.toUpperCase() === q);
      if (row !== -1) return { chartId: chart.id, col: col.name, row, code: col.codes[row] };
    }
  }
  return null;
}

function ChartImage({ chart, hit }: { chart: typeof CHARTS[0]; hit: Hit | null }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => {
      const img = el.querySelector("img");
      if (img) setSize({ w: img.offsetWidth, h: img.offsetHeight });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const activeHit = hit?.chartId === chart.id ? hit : null;
  const { rotateDeg } = CHART_CONFIG[chart.id];

  return (
    <div style={{ overflow: "hidden", position: "relative", borderRadius: 12 }}>
      <div
        ref={wrapRef}
        style={{
          position: "relative",
          transform: `rotate(${rotateDeg}deg)`,
          transformOrigin: "center center",
        }}
      >
        <img
          src={chart.file}
          alt={chart.label}
          style={{ display: "block", width: "100%", userSelect: "none" }}
          onLoad={() => {
            const img = wrapRef.current?.querySelector("img");
            if (img) setSize({ w: img.offsetWidth, h: img.offsetHeight });
          }}
        />
        {size.w > 0 && activeHit && chart.columns.map((col) =>
          col.name === activeHit.col
            ? col.codes.map((_, i) => {
                if (i !== activeHit.row) return null;
                const cfg = CHART_CONFIG[chart.id];
                const cx = col.xPct * size.w;
                const cy = rowYPct(chart.id, i) * size.h;
                const bw = (cfg.boxW / cfg.imageW) * size.w;
                const bh = (cfg.rowH * 0.85 / cfg.imageH) * size.h;
                return (
                  <div key={`hit-${col.name}-${i}`}
                    style={{
                      position: "absolute",
                      left: cx - bw / 2,
                      top: cy - bh / 2,
                      width: bw,
                      height: bh,
                      borderRadius: 6,
                      backgroundColor: "rgba(255, 230, 0, 0.45)",
                      boxShadow: "0 0 0 2.5px #f59e0b, 0 0 16px rgba(245,158,11,0.7)",
                      pointerEvents: "none",
                      animation: "pulse-ring 1.2s ease-in-out infinite",
                    }}
                  />
                );
              })
            : null
        )}
      </div>
    </div>
  );
}

export default function Home() {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const hitRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const hit = findCode(query);

  useEffect(() => {
    if (hit) {
      setTimeout(() => hitRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 200);
    }
  }, [hit?.chartId, hit?.col, hit?.row]);

  const handleClear = () => {
    setQuery("");
    inputRef.current?.focus();
  };

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#f0fdf4", fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{
        background: "linear-gradient(135deg, #14532d 0%, #16a34a 100%)",
        padding: "20px 16px 28px",
        textAlign: "center",
        position: "relative",
        overflow: "hidden",
      }}>
        {/* decorative circles */}
        <div style={{ position: "absolute", top: -30, right: -30, width: 120, height: 120, borderRadius: "50%", background: "rgba(255,255,255,0.06)" }} />
        <div style={{ position: "absolute", bottom: -20, left: -20, width: 90, height: 90, borderRadius: "50%", background: "rgba(255,255,255,0.06)" }} />

        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 6 }}>
          <div style={{
            width: 36, height: 36, borderRadius: "50%", background: "rgba(255,255,255,0.2)",
            display: "flex", alignItems: "center", justifyContent: "center",
            border: "2px solid rgba(255,255,255,0.4)",
          }}>
            <span style={{ fontSize: 18 }}>🧵</span>
          </div>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "white", letterSpacing: "0.01em" }}>
            Tra Cứu Màu Chỉ Gingko
          </h1>
        </div>
        <p style={{ margin: 0, fontSize: 12, color: "rgba(255,255,255,0.75)" }}>
          100% Polyester · High-Grade Embroidery Thread
        </p>
      </div>

      {/* Sticky search bar */}
      <div style={{
        position: "sticky", top: 0, zIndex: 20,
        background: "rgba(240,253,244,0.95)",
        backdropFilter: "blur(10px)",
        borderBottom: "1px solid #bbf7d0",
        padding: "12px 16px",
      }}>
        <div style={{ maxWidth: 640, margin: "0 auto" }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            background: "white",
            border: `2px solid ${focused ? "#16a34a" : "#d1fae5"}`,
            borderRadius: 14,
            padding: "10px 14px",
            boxShadow: focused ? "0 0 0 3px rgba(22,163,74,0.15)" : "0 2px 8px rgba(0,0,0,0.06)",
            transition: "all 0.2s ease",
          }}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>🔍</span>
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder="Nhập mã màu: G622, 5860, 9030..."
              autoFocus
              style={{
                flex: 1, border: "none", outline: "none",
                fontSize: 16, color: "#1a1a1a", background: "transparent",
                fontWeight: 500,
              }}
            />
            {query && (
              <button onClick={handleClear} style={{
                border: "none", background: "#f3f4f6", color: "#6b7280",
                borderRadius: "50%", width: 24, height: 24, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 14, flexShrink: 0, padding: 0,
              }}>✕</button>
            )}
          </div>

          {/* Result badge */}
          {query && (
            <div style={{ marginTop: 10, display: "flex", justifyContent: "center" }}>
              {hit ? (
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: 8,
                  background: "linear-gradient(135deg, #dcfce7, #bbf7d0)",
                  border: "1px solid #86efac",
                  borderRadius: 20, padding: "6px 16px",
                  fontSize: 13, fontWeight: 600, color: "#15803d",
                }}>
                  <span style={{ fontSize: 16 }}>✅</span>
                  Tìm thấy <strong style={{ fontSize: 15 }}>{hit.code}</strong>
                  &nbsp;·&nbsp; Cột <strong>{hit.col}</strong> · Hàng <strong>{hit.row + 1}</strong>
                </div>
              ) : (
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: 8,
                  background: "#fef2f2", border: "1px solid #fecaca",
                  borderRadius: 20, padding: "6px 16px",
                  fontSize: 13, fontWeight: 500, color: "#dc2626",
                }}>
                  <span style={{ fontSize: 16 }}>❌</span>
                  Không tìm thấy mã &ldquo;{query}&rdquo;
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Charts */}
      <main style={{ maxWidth: 680, margin: "0 auto", padding: "20px 12px 32px" }}>
        {CHARTS.map((chart) => {
          const isHitChart = hit?.chartId === chart.id;
          return (
            <div key={chart.id} ref={isHitChart ? hitRef : undefined} style={{ marginBottom: 24 }}>
              {/* Section header */}
              <div style={{
                display: "flex", alignItems: "center", gap: 10, marginBottom: 8,
              }}>
                <div style={{
                  width: 4, height: 20, borderRadius: 2,
                  background: isHitChart ? "#16a34a" : "#86efac",
                  transition: "background 0.3s",
                }} />
                <span style={{
                  fontSize: 13, fontWeight: 700, color: isHitChart ? "#15803d" : "#4b5563",
                  textTransform: "uppercase", letterSpacing: "0.08em",
                  transition: "color 0.3s",
                }}>
                  {chart.label}
                </span>
                {isHitChart && (
                  <span style={{
                    display: "inline-flex", alignItems: "center", gap: 4,
                    background: "#fef08a", border: "1px solid #fde047",
                    borderRadius: 10, padding: "2px 10px",
                    fontSize: 12, fontWeight: 600, color: "#92400e",
                  }}>
                    📍 Mã {hit!.code}
                  </span>
                )}
              </div>

              {/* Image card */}
              <div style={{
                borderRadius: 16, overflow: "hidden",
                boxShadow: isHitChart
                  ? "0 0 0 2px #16a34a, 0 8px 24px rgba(22,163,74,0.2)"
                  : "0 4px 16px rgba(0,0,0,0.1)",
                border: `2px solid ${isHitChart ? "#16a34a" : "transparent"}`,
                transition: "all 0.3s ease",
                background: "white",
              }}>
                <ChartImage chart={chart} hit={hit} />
              </div>
            </div>
          );
        })}
      </main>

      {/* Footer */}
      <div style={{
        textAlign: "center", padding: "16px", borderTop: "1px solid #dcfce7",
        background: "white", fontSize: 12, color: "#9ca3af",
      }}>
        Gingko Brand High-Grade Embroidery Thread · 100% Polyester
      </div>

      <style>{`
        @keyframes pulse-ring {
          0%, 100% { box-shadow: 0 0 0 2.5px #f59e0b, 0 0 12px rgba(245,158,11,0.6); }
          50% { box-shadow: 0 0 0 4px #f59e0b, 0 0 24px rgba(245,158,11,0.9); }
        }
        input[type="search"]::-webkit-search-cancel-button { display: none; }
      `}</style>
    </div>
  );
}
