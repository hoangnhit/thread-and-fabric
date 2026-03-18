import { useState, useRef, useEffect, useCallback } from "react";

/* ─── DATA ─────────────────────────────────────────────────────── */
const CHART_CONFIG = {
  ae: { imageW: 1158, imageH: 1280, topY: 35, rowH: 62, rotateDeg: 0, boxW: 78 },
  pt: { imageW: 960,  imageH: 1280, topY: 215, rowH: 52, rotateDeg: 0, boxW: 65 },
};

function rowYPct(chartId: "ae" | "pt", i: number) {
  const { topY, rowH, imageH } = CHART_CONFIG[chartId];
  return (topY + (i + 0.5) * rowH) / imageH;
}

const CHARTS = [
  {
    id: "ae" as const, file: "/thread-chart-ae.jpg", label: "Bảng A – E",
    columns: [
      { name: "A", xPct: 0.045, codes: ["G622","G661","G561","G666","G866","G861","G727","G735","G626","9003","5860","G683","G623","G924","G980","G724","G971","9001","G024","G624"] },
      { name: "B", xPct: 0.240, codes: ["G826","G755","5695","G771","5766","G955","G172","5763","G951","G725","G772","G625","G869","G763","G765","G778","G965","G678","9072","G987"] },
      { name: "C", xPct: 0.438, codes: ["G713","G818","G816","9030","G915","G815","G549","G819","5675","G948","G921","G548","G994","G721","G584","G990","G754","G734","G910","G993"] },
      { name: "D", xPct: 0.638, codes: ["G653","G882","G853","G752","G820","G817","G620","G777","G616","G952","G521","G621","5767","G588","G779","G919","G917","G508","5732","G984"] },
      { name: "E", xPct: 0.835, codes: ["G878","G509","G637","5566","G839","G838","G747","5629","00344","G681","G707","G986","G639","G786","G821","G781","G899","5634","G782","G783"] },
    ],
  },
  {
    id: "pt" as const, file: "/thread-chart-pt.jpg", label: "Bảng P – T",
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
      const row = col.codes.findIndex(c => c.toUpperCase() === q);
      if (row !== -1) return { chartId: chart.id, col: col.name, row, code: col.codes[row] };
    }
  }
  return null;
}

/* ─── HIGHLIGHT SLOT STYLES ─────────────────────────────────────── */
const SLOTS = [
  { color: "rgba(251,191,36,0.45)", border: "#f59e0b", glow: "rgba(245,158,11,0.7)", label: "#92400e", bg: "#fef3c7", bdg: "#fde68a", icon: "🟡", anim: "pulse-a" },
  { color: "rgba(56,189,248,0.35)", border: "#0ea5e9", glow: "rgba(14,165,233,0.6)", label: "#075985", bg: "#e0f2fe", bdg: "#bae6fd", icon: "🔵", anim: "pulse-b" },
];

/* ─── CHART IMAGE WITH OVERLAY ───────────────────────────────────── */
function ChartImage({
  chart, pins,
}: { chart: typeof CHARTS[0]; pins: (Hit | null)[] }) {
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

  const { rotateDeg } = CHART_CONFIG[chart.id];

  return (
    <div style={{ overflow: "hidden", position: "relative", borderRadius: 14 }}>
      <div ref={wrapRef} style={{ position: "relative", transform: `rotate(${rotateDeg}deg)`, transformOrigin: "center center" }}>
        <img
          src={chart.file} alt={chart.label}
          style={{ display: "block", width: "100%", userSelect: "none" }}
          onLoad={() => {
            const img = wrapRef.current?.querySelector("img");
            if (img) setSize({ w: img.offsetWidth, h: img.offsetHeight });
          }}
        />
        {size.w > 0 && pins.map((pin, slotIdx) => {
          if (!pin || pin.chartId !== chart.id) return null;
          const col = chart.columns.find(c => c.name === pin.col);
          if (!col) return null;
          const cfg = CHART_CONFIG[chart.id];
          const cx = col.xPct * size.w;
          const cy = rowYPct(chart.id, pin.row) * size.h;
          const bw = (cfg.boxW / cfg.imageW) * size.w;
          const bh = (cfg.rowH * 0.85 / cfg.imageH) * size.h;
          const s = SLOTS[slotIdx];
          return (
            <div key={`pin-${slotIdx}`} style={{
              position: "absolute",
              left: cx - bw / 2, top: cy - bh / 2,
              width: bw, height: bh,
              borderRadius: 6,
              backgroundColor: s.color,
              boxShadow: `0 0 0 2.5px ${s.border}, 0 0 14px ${s.glow}`,
              pointerEvents: "none",
              animation: `${s.anim} 1.4s ease-in-out infinite`,
            }} />
          );
        })}
      </div>
    </div>
  );
}

/* ─── SEARCH INPUT ───────────────────────────────────────────────── */
function SearchInput({
  value, onChange, onClear, placeholder, slotIdx, focused, onFocus, onBlur,
}: {
  value: string; onChange: (v: string) => void; onClear: () => void;
  placeholder: string; slotIdx: number; focused: boolean;
  onFocus: () => void; onBlur: () => void;
}) {
  const s = SLOTS[slotIdx];
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      background: "white",
      border: `2px solid ${focused ? s.border : "#e5e7eb"}`,
      borderRadius: 12, padding: "10px 14px",
      boxShadow: focused ? `0 0 0 4px ${s.color}` : "0 1px 4px rgba(0,0,0,0.07)",
      transition: "all 0.2s",
    }}>
      <span style={{ fontSize: 16 }}>{s.icon}</span>
      <input
        type="search"
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        placeholder={placeholder}
        style={{
          flex: 1, border: "none", outline: "none",
          fontSize: 15, color: "#111", background: "transparent",
          fontFamily: "'SF Mono', 'Fira Code', monospace", fontWeight: 600,
        }}
      />
      {value && (
        <button onClick={onClear} style={{
          border: "none", background: "#f3f4f6", color: "#6b7280",
          borderRadius: "50%", width: 22, height: 22, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 12, padding: 0, flexShrink: 0,
        }}>✕</button>
      )}
    </div>
  );
}

/* ─── MAIN ───────────────────────────────────────────────────────── */
export default function Home() {
  const [queries, setQueries] = useState(["", ""]);
  const [focused, setFocused] = useState<number | null>(null);
  const hitRef = useRef<HTMLDivElement | null>(null);

  const hits = queries.map(q => findCode(q));
  const activeHit = hits.find(Boolean) ?? null;

  // scroll to first result
  useEffect(() => {
    if (activeHit) {
      setTimeout(() => hitRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 200);
    }
  }, [activeHit?.chartId, activeHit?.col, activeHit?.row]);

  const update = useCallback((i: number, v: string) => {
    setQueries(qs => { const n = [...qs]; n[i] = v; return n; });
  }, []);

  const comparing = hits[0] && hits[1];

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif" }}>

      {/* ── HERO HEADER ── */}
      <div style={{
        background: "linear-gradient(160deg, #064e3b 0%, #065f46 40%, #059669 100%)",
        padding: "28px 20px 48px",
        position: "relative", overflow: "hidden",
      }}>
        <div style={{ position: "absolute", top: -40, right: -40, width: 180, height: 180, borderRadius: "50%", background: "rgba(255,255,255,0.04)" }} />
        <div style={{ position: "absolute", bottom: -20, left: 20, width: 100, height: 100, borderRadius: "50%", background: "rgba(255,255,255,0.05)" }} />
        <div style={{ position: "absolute", top: 20, left: "30%", width: 60, height: 60, borderRadius: "50%", background: "rgba(255,255,255,0.04)" }} />
        <div style={{ maxWidth: 640, margin: "0 auto", position: "relative", zIndex: 1, textAlign: "center" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "rgba(255,255,255,0.12)", borderRadius: 20, padding: "4px 12px", marginBottom: 14, fontSize: 11, color: "rgba(255,255,255,0.8)", letterSpacing: "0.1em", fontWeight: 600 }}>
            🧵 &nbsp;GINGKO BRAND
          </div>
          <h1 style={{ margin: "0 0 6px", fontSize: 26, fontWeight: 800, color: "white", letterSpacing: "-0.02em", lineHeight: 1.2 }}>
            Tra Cứu Màu Chỉ Thêu
          </h1>
          <p style={{ margin: 0, fontSize: 13, color: "rgba(255,255,255,0.65)", fontWeight: 400 }}>
            High-Grade Embroidery Thread · 100% Polyester
          </p>
        </div>
      </div>

      {/* ── SEARCH CARD (floats over hero) ── */}
      <div style={{ maxWidth: 640, margin: "-28px auto 0", padding: "0 16px", position: "relative", zIndex: 10 }}>
        <div style={{
          background: "white", borderRadius: 20, padding: 20,
          boxShadow: "0 8px 40px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.06)",
        }}>
          <p style={{ margin: "0 0 14px", fontSize: 12, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Tìm kiếm mã màu
          </p>

          {/* Row 1: single search */}
          <SearchInput
            value={queries[0]} onChange={v => update(0, v)} onClear={() => update(0, "")}
            placeholder="Mã màu 1 — vd: G622, 5860..."
            slotIdx={0} focused={focused === 0}
            onFocus={() => setFocused(0)} onBlur={() => setFocused(null)}
          />

          {/* Row 2: compare search */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "10px 0" }}>
            <div style={{ flex: 1, height: 1, background: "#f1f5f9" }} />
            <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600, whiteSpace: "nowrap" }}>SO SÁNH VỚI</span>
            <div style={{ flex: 1, height: 1, background: "#f1f5f9" }} />
          </div>
          <SearchInput
            value={queries[1]} onChange={v => update(1, v)} onClear={() => update(1, "")}
            placeholder="Mã màu 2 — vd: G826, 9030..."
            slotIdx={1} focused={focused === 1}
            onFocus={() => setFocused(1)} onBlur={() => setFocused(null)}
          />

          {/* Results row */}
          {(hits[0] || hits[1] || queries.some(Boolean)) && (
            <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
              {[0, 1].map(i => {
                const q = queries[i];
                const h = hits[i];
                const s = SLOTS[i];
                if (!q) return null;
                return (
                  <div key={i} style={{
                    flex: 1, minWidth: 120,
                    background: h ? s.bg : "#fef2f2",
                    border: `1.5px solid ${h ? s.bdg : "#fecaca"}`,
                    borderRadius: 10, padding: "8px 12px",
                    display: "flex", alignItems: "center", gap: 8,
                  }}>
                    <span style={{ fontSize: 15 }}>{h ? "✓" : "✗"}</span>
                    <div>
                      {h ? (
                        <>
                          <div style={{ fontSize: 13, fontWeight: 700, color: s.label, fontFamily: "monospace" }}>{h.code}</div>
                          <div style={{ fontSize: 11, color: "#6b7280" }}>Cột {h.col} · Hàng {h.row + 1}</div>
                        </>
                      ) : (
                        <div style={{ fontSize: 12, color: "#dc2626" }}>Không tìm thấy &ldquo;{q}&rdquo;</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Compare banner */}
          {comparing && (
            <div style={{
              marginTop: 12,
              background: "linear-gradient(135deg, #fef3c7, #e0f2fe)",
              border: "1.5px solid #fde68a",
              borderRadius: 10, padding: "10px 14px",
              display: "flex", alignItems: "center", gap: 10,
            }}>
              <span style={{ fontSize: 18 }}>↔️</span>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>
                Đang so sánh &nbsp;
                <span style={{ background: "#fde68a", borderRadius: 6, padding: "1px 8px", fontFamily: "monospace" }}>{hits[0]!.code}</span>
                &nbsp; với &nbsp;
                <span style={{ background: "#bae6fd", borderRadius: 6, padding: "1px 8px", fontFamily: "monospace" }}>{hits[1]!.code}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── CHARTS ── */}
      <main style={{ maxWidth: 640, margin: "0 auto", padding: "24px 16px 40px" }}>
        {CHARTS.map((chart) => {
          const chartHits = hits.filter(h => h?.chartId === chart.id);
          const isActive = chartHits.length > 0;
          return (
            <div key={chart.id}
              ref={isActive ? hitRef : undefined}
              style={{ marginBottom: 28 }}
            >
              {/* Section label */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <div style={{ width: 3, height: 18, borderRadius: 2, background: isActive ? "#059669" : "#d1fae5" }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: isActive ? "#065f46" : "#9ca3af", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  {chart.label}
                </span>
                {chartHits.map((h, idx) => h && (
                  <span key={idx} style={{
                    background: SLOTS[hits.indexOf(h)].bg,
                    border: `1px solid ${SLOTS[hits.indexOf(h)].bdg}`,
                    borderRadius: 8, padding: "2px 9px",
                    fontSize: 11, fontWeight: 700,
                    color: SLOTS[hits.indexOf(h)].label,
                    fontFamily: "monospace",
                  }}>
                    {SLOTS[hits.indexOf(h)].icon} {h.code}
                  </span>
                ))}
              </div>

              {/* Image card */}
              <div style={{
                borderRadius: 16, overflow: "hidden",
                boxShadow: isActive
                  ? "0 0 0 2px #059669, 0 12px 36px rgba(5,150,105,0.18)"
                  : "0 2px 12px rgba(0,0,0,0.08)",
                border: `2px solid ${isActive ? "#059669" : "transparent"}`,
                transition: "all 0.35s cubic-bezier(0.4,0,0.2,1)",
                background: "#fff",
              }}>
                <ChartImage chart={chart} pins={hits} />
              </div>
            </div>
          );
        })}
      </main>

      {/* ── FOOTER ── */}
      <div style={{ textAlign: "center", padding: "20px 16px", borderTop: "1px solid #e5e7eb", background: "white" }}>
        <p style={{ margin: 0, fontSize: 12, color: "#9ca3af" }}>
          Gingko Brand High-Grade Embroidery Thread · 100% Polyester
        </p>
      </div>

      <style>{`
        @keyframes pulse-a {
          0%,100% { box-shadow: 0 0 0 2.5px #f59e0b, 0 0 10px rgba(245,158,11,0.55); }
          50%      { box-shadow: 0 0 0 4px   #f59e0b, 0 0 22px rgba(245,158,11,0.85); }
        }
        @keyframes pulse-b {
          0%,100% { box-shadow: 0 0 0 2.5px #0ea5e9, 0 0 10px rgba(14,165,233,0.5); }
          50%      { box-shadow: 0 0 0 4px   #0ea5e9, 0 0 22px rgba(14,165,233,0.8); }
        }
        input[type="search"]::-webkit-search-cancel-button { display: none; }
        * { box-sizing: border-box; }
      `}</style>
    </div>
  );
}
