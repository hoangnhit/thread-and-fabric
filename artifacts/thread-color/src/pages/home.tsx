import { useState, useRef, useEffect } from "react";

const CHART_CONFIG = {
  ae: { imageW: 1158, imageH: 1280, topY: 35, rowH: 62, rotateDeg: 0, boxW: 145 },
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
      { name: "A", xPct: 0.130, codes: ["G622","G661","G561","G666","G866","G861","G727","G735","G626","9003","5860","G683","G623","G924","G980","G724","G971","9001","G024","G624"] },
      { name: "B", xPct: 0.330, codes: ["G826","G755","5695","G771","5766","G955","G172","5763","G951","G725","G772","G625","G869","G763","G765","G778","G965","G678","9072","G987"] },
      { name: "C", xPct: 0.529, codes: ["G713","G818","G816","9030","G915","G815","G549","G819","5675","G948","G921","G548","G994","G721","G584","G990","G754","G734","G910","G993"] },
      { name: "D", xPct: 0.730, codes: ["G653","G882","G853","G752","G820","G817","G620","G777","G616","G952","G521","G621","5767","G588","G779","G919","G917","G508","5732","G984"] },
      { name: "E", xPct: 0.929, codes: ["G878","G509","G637","5566","G839","G838","G747","5629","00344","G681","G707","G986","G639","G786","G821","G781","G899","5634","G782","G783"] },
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
    <div style={{ overflow: "hidden", position: "relative" }}>
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
                  <div
                    key={`hit-${col.name}-${i}`}
                    style={{
                      position: "absolute",
                      left: cx - bw / 2,
                      top: cy - bh / 2,
                      width: bw,
                      height: bh,
                      borderRadius: 4,
                      backgroundColor: "rgba(255,220,0,0.5)",
                      boxShadow: "0 0 0 3px #f59e0b, 0 0 12px rgba(245,158,11,0.6)",
                      pointerEvents: "none",
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
  const hitRef = useRef<HTMLDivElement | null>(null);
  const hit = findCode(query);

  useEffect(() => {
    if (hit) {
      setTimeout(() => hitRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 150);
    }
  }, [hit?.chartId, hit?.col, hit?.row]);

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#f3f4f6", display: "flex", flexDirection: "column" }}>
      <header style={{
        position: "sticky", top: 0, zIndex: 20,
        backgroundColor: "white", borderBottom: "1px solid #e5e7eb",
        boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
      }}>
        <div style={{ maxWidth: 672, margin: "0 auto", padding: "12px 16px", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 32, height: 32, borderRadius: "50%", backgroundColor: "#15803d",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <span style={{ color: "white", fontSize: 12, fontWeight: "bold" }}>G</span>
          </div>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nhập mã màu (vd: G622, 5860...)"
            autoFocus
            style={{
              flex: 1, padding: "8px 12px", fontSize: 14,
              border: "1px solid #d1d5db", borderRadius: 8, outline: "none",
            }}
            onFocus={(e) => { e.target.style.borderColor = "#16a34a"; e.target.style.boxShadow = "0 0 0 3px rgba(22,163,74,0.1)"; }}
            onBlur={(e) => { e.target.style.borderColor = "#d1d5db"; e.target.style.boxShadow = "none"; }}
          />
          {hit && (
            <span style={{ fontSize: 14, fontWeight: 600, color: "#15803d", whiteSpace: "nowrap" }}>
              Cột {hit.col} · Hàng {hit.row + 1}
            </span>
          )}
          {query && !hit && (
            <span style={{ fontSize: 14, color: "#ef4444", whiteSpace: "nowrap" }}>Không tìm thấy</span>
          )}
        </div>
      </header>

      <main style={{ flex: 1, maxWidth: 672, margin: "0 auto", width: "100%", padding: "16px 8px", display: "flex", flexDirection: "column", gap: 24 }}>
        {CHARTS.map((chart) => {
          const isHitChart = hit?.chartId === chart.id;
          return (
            <div key={chart.id} ref={isHitChart ? hitRef : undefined}>
              <p style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4, paddingLeft: 4 }}>
                {chart.label}
                {isHitChart && (
                  <span style={{ marginLeft: 8, color: "#d97706", textTransform: "none", letterSpacing: 0, fontWeight: "bold" }}>
                    ↓ Mã {hit!.code}
                  </span>
                )}
              </p>
              <div style={{ borderRadius: 12, overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.15)", border: "1px solid #e5e7eb" }}>
                <ChartImage chart={chart} hit={hit} />
              </div>
            </div>
          );
        })}
      </main>

      <footer style={{ textAlign: "center", fontSize: 12, color: "#9ca3af", padding: "12px 0" }}>
        Gingko Brand — 100% Polyester
      </footer>
    </div>
  );
}
