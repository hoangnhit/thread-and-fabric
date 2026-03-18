import { useState, useRef, useEffect } from "react";

const IMAGE_WIDTH = 960;
const IMAGE_HEIGHT = 1280;

// Measured from actual images: first thread swatch center y, row spacing
const CHART_CONFIG = {
  ae: { topY: 252, rowH: 50 },
  pt: { topY: 215, rowH: 52 },
};

function rowYPct(chartId: "ae" | "pt", i: number): number {
  const { topY, rowH } = CHART_CONFIG[chartId];
  return (topY + (i + 0.5) * rowH) / IMAGE_HEIGHT;
}

const CHARTS = [
  {
    id: "ae" as const,
    file: "/thread-chart-ae.jpg",
    label: "Bảng A – E",
    columns: [
      { name: "A", xPct: 0.078, codes: ["G622","G661","G561","G666","G866","G861","G727","G735","G626","9003","5860","G683","G623","G924","G980","G724","G971","9001","G024","G624"] },
      { name: "B", xPct: 0.255, codes: ["G826","G755","5695","G771","5766","G955","G172","5763","G951","G725","G772","G625","G869","G763","G765","G778","G965","G678","9072","G987"] },
      { name: "C", xPct: 0.432, codes: ["G713","G818","G816","9030","G915","G815","G549","G819","5675","G948","G921","G548","G994","G721","G584","G990","G754","G734","G910","G993"] },
      { name: "D", xPct: 0.609, codes: ["G653","G882","G853","G752","G820","G817","G620","G777","G616","G952","G521","G621","5767","G588","G779","G919","G917","G508","5732","G984"] },
      { name: "E", xPct: 0.786, codes: ["G878","G509","G637","5566","G839","G838","G747","5629","O0344","G681","G707","G986","G639","G786","G821","G781","G899","5634","G782","G783"] },
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

// Per-chart CSS rotation to visually straighten the photo
const CHART_ROTATE_DEG: Record<string, number> = {
  ae: 1.5,  // AE photo: right side slightly high, rotate clockwise
  pt: 0.3,  // PT photo: near-straight
};

function ChartImage({ chart, hit }: { chart: typeof CHARTS[0]; hit: Hit | null }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const inner = el.querySelector(".chart-inner") as HTMLElement;
      if (inner) setSize({ w: inner.offsetWidth, h: inner.offsetHeight });
    };
    const ro = new ResizeObserver(update);
    ro.observe(el);
    update();
    return () => ro.disconnect();
  }, []);

  const activeHit = hit?.chartId === chart.id ? hit : null;
  const rotateDeg = CHART_ROTATE_DEG[chart.id] ?? 0;

  return (
    <div ref={containerRef} className="w-full overflow-hidden" style={{ position: "relative" }}>
      <div
        className="chart-inner relative"
        style={{
          transformOrigin: "center center",
          transform: `rotate(${rotateDeg}deg)`,
          width: "100%",
        }}
      >
      <img
        src={chart.file}
        alt={chart.label}
        className="w-full block"
        style={{ userSelect: "none" }}
        onLoad={() => {
          const inner = containerRef.current?.querySelector(".chart-inner") as HTMLElement;
          if (inner) setSize({ w: inner.offsetWidth, h: inner.offsetHeight });
        }}
      />

      {size.w > 0 && chart.columns.map((col) =>
        col.codes.map((code, i) => {
          const isHit = activeHit?.col === col.name && activeHit?.row === i;
          const cx = col.xPct * size.w;
          const cy = rowYPct(chart.id, i) * size.h;
          const boxW = (65 / IMAGE_WIDTH) * size.w;
          const boxH = (CHART_CONFIG[chart.id].rowH * 0.85 / IMAGE_HEIGHT) * size.h;

          if (!isHit) return null;

          return (
            <div
              key={`${col.name}-${i}`}
              style={{
                position: "absolute",
                left: cx - boxW / 2,
                top: cy - boxH / 2,
                width: boxW,
                height: boxH,
                borderRadius: 4,
                backgroundColor: "rgba(255,220,0,0.5)",
                boxShadow: "0 0 0 3px #f59e0b, 0 0 12px rgba(245,158,11,0.6)",
                pointerEvents: "none",
              }}
            />
          );
        })
      )}
      </div>
    </div>
  );
}

export default function Home() {
  const [query, setQuery] = useState("");
  const hitChartRef = useRef<HTMLDivElement | null>(null);

  const hit = findCode(query);

  useEffect(() => {
    if (hit) {
      setTimeout(() => {
        hitChartRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 150);
    }
  }, [hit?.chartId, hit?.col, hit?.row]);

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <header className="sticky top-0 z-20 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-green-700 flex items-center justify-center flex-shrink-0">
            <span className="text-white text-xs font-bold">G</span>
          </div>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nhập mã màu (vd: G622, 5860...)"
            className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100 transition"
            autoFocus
          />
          {hit && (
            <span className="text-sm font-semibold text-green-700 flex-shrink-0 whitespace-nowrap">
              Cột {hit.col} · Hàng {hit.row + 1}
            </span>
          )}
          {query && !hit && (
            <span className="text-sm text-red-500 flex-shrink-0">Không tìm thấy</span>
          )}
        </div>
      </header>

      <main className="flex-1 max-w-2xl mx-auto w-full px-2 py-4 flex flex-col gap-6">
        {CHARTS.map((chart) => {
          const isHitChart = hit?.chartId === chart.id;
          return (
            <div
              key={chart.id}
              ref={isHitChart ? hitChartRef : undefined}
            >
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-1 px-1">
                {chart.label}
                {isHitChart && (
                  <span className="ml-2 text-amber-600 normal-case tracking-normal font-bold">
                    ↓ Đang hiển thị mã {hit!.code}
                  </span>
                )}
              </p>
              <div className="rounded-xl overflow-hidden shadow-md border border-gray-200">
                <ChartImage chart={chart} hit={hit} />
              </div>
            </div>
          );
        })}
      </main>

      <footer className="text-center text-xs text-gray-400 py-3">
        Gingko Brand — 100% Polyester
      </footer>
    </div>
  );
}
