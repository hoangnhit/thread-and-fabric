import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "wouter";

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

const ALL_CODES: Hit[] = CHARTS.flatMap(chart =>
  chart.columns.flatMap(col =>
    col.codes.map((code, row) => ({ chartId: chart.id, col: col.name, row, code }))
  )
);

function findCode(query: string): Hit | null {
  const q = query.trim().toUpperCase();
  if (!q) return null;
  return ALL_CODES.find(h => h.code.toUpperCase() === q) ?? null;
}

/** Extract potential thread codes from freeform text */
function extractCodes(text: string): string[] {
  const tokens = text.match(/[GOgo]?\d{3,4}|[GOgo]\d{3}/g) ?? [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const t of tokens) {
    const upper = t.trim().toUpperCase();
    if (upper.length >= 3 && !seen.has(upper)) {
      seen.add(upper);
      result.push(upper);
    }
  }
  return result;
}

type Mode = "single" | "compare" | "scan";

/* ─── CHART IMAGE ──────────────────────────────────────────────── */
const SLOT_STYLES = [
  { fill: "rgba(251,191,36,0.4)", border: "#f59e0b", glow: "rgba(245,158,11,0.75)", anim: "pa" },
  { fill: "rgba(56,189,248,0.35)", border: "#0ea5e9", glow: "rgba(14,165,233,0.65)", anim: "pb" },
];
const SCAN_STYLE = { fill: "rgba(251,191,36,0.4)", border: "#f59e0b", glow: "rgba(245,158,11,0.7)", anim: "pa" };
const FOCUSED_SCAN_STYLE = { fill: "rgba(5,150,105,0.45)", border: "#059669", glow: "rgba(5,150,105,0.8)", anim: "pc" };

function ChartImage({ chart, pins, focusedCode }: { chart: typeof CHARTS[0]; pins: { hit: Hit; slotStyle: typeof SLOT_STYLES[0] }[]; focusedCode?: string | null }) {
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

  return (
    <div style={{ overflow: "hidden", position: "relative", borderRadius: 14 }}>
      <div ref={wrapRef} style={{ position: "relative", transform: `rotate(${CHART_CONFIG[chart.id].rotateDeg}deg)`, transformOrigin: "center center" }}>
        <img
          src={chart.file} alt={chart.label}
          style={{ display: "block", width: "100%", userSelect: "none" }}
          onLoad={() => {
            const img = wrapRef.current?.querySelector("img");
            if (img) setSize({ w: img.offsetWidth, h: img.offsetHeight });
          }}
        />
        {size.w > 0 && pins
          .filter(p => p.hit.chartId === chart.id)
          .map(({ hit, slotStyle }, idx) => {
            const col = chart.columns.find(c => c.name === hit.col);
            if (!col) return null;
            const cfg = CHART_CONFIG[chart.id];
            const cx = col.xPct * size.w;
            const cy = rowYPct(chart.id, hit.row) * size.h;
            const bw = (cfg.boxW / cfg.imageW) * size.w;
            const bh = (cfg.rowH * 0.85 / cfg.imageH) * size.h;
            const isFocused = focusedCode != null && hit.code === focusedCode;
            const s = isFocused ? FOCUSED_SCAN_STYLE : slotStyle;
            return (
              <div key={`pin-${idx}`} style={{
                position: "absolute",
                left: cx - bw / 2, top: cy - bh / 2,
                width: bw, height: bh, borderRadius: 6,
                backgroundColor: s.fill,
                boxShadow: `0 0 0 2.5px ${s.border}, 0 0 14px ${s.glow}`,
                pointerEvents: "none",
                animation: `${s.anim} 1.4s ease-in-out infinite`,
                zIndex: isFocused ? 10 : 1,
              }} />
            );
          })}
      </div>
    </div>
  );
}

/* ─── MAIN ──────────────────────────────────────────────────────── */
export default function Home() {
  const [, navigate] = useLocation();
  const [brand, setBrand] = useState<"all" | "gingko" | "dantuong">("all");
  const [mode, setMode] = useState<Mode>("single");
  const [q1, setQ1] = useState("");
  const [q2, setQ2] = useState("");
  const [scanText, setScanText] = useState("");
  const [foc1, setFoc1] = useState(false);
  const [foc2, setFoc2] = useState(false);
  const [focusedScan, setFocusedScan] = useState<Hit | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const chartRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const topRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = document.querySelector(".page-scroll-root") ?? window;
    const handler = () => {
      const y = el === window ? window.scrollY : (el as HTMLElement).scrollTop;
      const nowScrolled = y > 80;
      setScrolled(nowScrolled);
      if (!nowScrolled) setCollapsed(false);
    };
    el.addEventListener("scroll", handler, { passive: true });
    return () => el.removeEventListener("scroll", handler);
  }, []);

  // hits
  const hit1 = findCode(q1);
  const hit2 = mode === "compare" ? findCode(q2) : null;

  // scan results
  const scanCodes = mode === "scan" ? extractCodes(scanText) : [];
  const scanFound = scanCodes.map(c => findCode(c)).filter(Boolean) as Hit[];
  const scanMissed = scanCodes.filter(c => !findCode(c));

  // build pins array
  const pins: { hit: Hit; slotStyle: typeof SLOT_STYLES[0] }[] = [];
  if (mode === "single" || mode === "compare") {
    if (hit1) pins.push({ hit: hit1, slotStyle: SLOT_STYLES[0] });
    if (hit2) pins.push({ hit: hit2, slotStyle: SLOT_STYLES[1] });
  } else if (mode === "scan") {
    scanFound.forEach(h => pins.push({ hit: h, slotStyle: SCAN_STYLE }));
  }

  // scroll to chart when single/compare hit changes
  const firstHit = (mode !== "scan") ? (pins[0]?.hit ?? null) : null;
  useEffect(() => {
    if (firstHit) {
      setTimeout(() => {
        chartRefs.current[firstHit.chartId]?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 200);
    }
  }, [firstHit?.chartId, firstHit?.col, firstHit?.row]);

  // scroll to chart when scan chip is clicked
  useEffect(() => {
    if (focusedScan) {
      setTimeout(() => {
        chartRefs.current[focusedScan.chartId]?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);
    }
  }, [focusedScan]);

  const scrollToCode = useCallback((h: Hit) => {
    setFocusedScan(h);
  }, []);

  const switchMode = useCallback((m: Mode) => {
    setMode(m);
    setQ1(""); setQ2(""); setScanText(""); setFocusedScan(null);
  }, []);

  /* main tab style */
  const mainTab = (active: boolean, color: string) => ({
    flex: 1, padding: "9px 10px", border: "none",
    borderBottom: active ? `2.5px solid ${color}` : "2.5px solid transparent",
    marginBottom: -1, cursor: "pointer",
    fontSize: 13, fontWeight: active ? 700 : 500,
    color: active ? color : "#9ca3af",
    background: "transparent", transition: "all 0.15s",
    whiteSpace: "nowrap" as const,
  });

  /* segmented control button */
  const segBtn = (active: boolean, color = "#059669"): CSSProperties => ({
    flex: 1, padding: "6px 8px", border: "none", cursor: "pointer",
    borderRadius: 7, fontSize: 12, fontWeight: active ? 700 : 500,
    background: active ? "white" : "transparent",
    color: active ? color : "#94a3b8",
    boxShadow: active ? "0 1px 4px rgba(0,0,0,0.12), 0 0 0 0.5px rgba(0,0,0,0.04)" : "none",
    transition: "all 0.18s", whiteSpace: "nowrap" as const,
  });

  const inputBox = (focused: boolean, accent = "#f59e0b") => ({
    display: "flex", alignItems: "center", gap: 10,
    background: "white",
    border: `2px solid ${focused ? accent : "#e5e7eb"}`,
    borderRadius: 12, padding: "11px 14px",
    boxShadow: focused ? `0 0 0 4px ${accent}30` : "0 1px 4px rgba(0,0,0,0.07)",
    transition: "all 0.2s",
  });

  return (
    <div ref={topRef} style={{ minHeight: "100vh", background: "#f8fafc", fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif" }}>

      {/* ── HERO ── */}
      <div style={{
        background: "linear-gradient(160deg, #064e3b 0%, #065f46 40%, #059669 100%)",
        padding: "28px 20px 48px", position: "relative", overflow: "hidden",
      }}>
        <div style={{ position: "absolute", top: -40, right: -40, width: 180, height: 180, borderRadius: "50%", background: "rgba(255,255,255,0.04)" }} />
        <div style={{ position: "absolute", bottom: -20, left: 20, width: 100, height: 100, borderRadius: "50%", background: "rgba(255,255,255,0.05)" }} />
        <div style={{ maxWidth: 640, margin: "0 auto", position: "relative", zIndex: 1, textAlign: "center" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.12)", borderRadius: 20, padding: "4px 14px", marginBottom: 14, fontSize: 11, color: "rgba(255,255,255,0.85)", letterSpacing: "0.1em", fontWeight: 700 }}>
            🧵 GINGKO BRAND
          </div>
          <h1 style={{ margin: "0 0 6px", fontSize: 26, fontWeight: 800, color: "white", letterSpacing: "-0.02em" }}>
            Tra Cứu Màu Chỉ Thêu
          </h1>
          <p style={{ margin: 0, fontSize: 13, color: "rgba(255,255,255,0.65)" }}>
            High-Grade Embroidery Thread · 100% Polyester
          </p>
        </div>
      </div>

      {/* ── MAIN CARD ── */}
      <div style={{
        position: "sticky", top: 0, zIndex: 50,
        background: scrolled ? "#f8fafc" : "transparent",
        paddingTop: scrolled ? 8 : 0,
        transition: "background 0.2s, padding 0.2s",
      }}>
      <div style={{ maxWidth: 640, margin: scrolled ? "0 auto" : "-28px auto 0", padding: "0 16px", position: "relative", zIndex: 10, transition: "margin 0.2s" }}>
        <div style={{
          background: "white",
          borderRadius: scrolled ? "0 0 20px 20px" : 20,
          padding: 20,
          boxShadow: scrolled
            ? "0 4px 20px rgba(0,0,0,0.15)"
            : "0 8px 40px rgba(0,0,0,0.13), 0 2px 8px rgba(0,0,0,0.06)",
          transition: "border-radius 0.2s, box-shadow 0.2s",
        }}>

          {/* ── NAV: tier-1 main sections ── */}
          {!collapsed && (
            <div style={{ marginBottom: 0 }}>
              {/* Tier 1 — three main tabs */}
              <div style={{ display: "flex", borderBottom: "1px solid #e5e7eb", marginBottom: 14 }}>
                <button onClick={() => navigate("/fabrics")} style={mainTab(false, "#d97706")}>
                  🎨 Danh mục vải
                </button>
                <button style={mainTab(true, "#059669")}>
                  🧵 Danh mục màu chỉ
                </button>
                <button onClick={() => navigate("/viewer")} style={mainTab(false, "#6d28d9")}>
                  📁 File thêu
                </button>
              </div>

              {/* Tier 2 — brand segmented control */}
              <div style={{ display: "flex", background: "#f1f5f9", borderRadius: 9, padding: 3, gap: 2, marginBottom: 8 }}>
                <button style={segBtn(brand === "all", "#374151")} onClick={() => setBrand("all")}>Tất cả</button>
                <button style={segBtn(brand === "gingko", "#059669")} onClick={() => setBrand("gingko")}>🧵 Chỉ GINGKO</button>
                <button style={segBtn(brand === "dantuong", "#3b82f6")} onClick={() => setBrand("dantuong")}>🪡 Chỉ danh tường</button>
              </div>

              {/* Tier 3 — mode segmented control */}
              <div style={{ display: "flex", background: "#f1f5f9", borderRadius: 9, padding: 3, gap: 2, marginBottom: 18 }}>
                <button style={segBtn(mode === "single", "#059669")} onClick={() => switchMode("single")}>🔍 Tìm mã</button>
                <button style={segBtn(mode === "compare", "#0ea5e9")} onClick={() => switchMode("compare")}>↔️ So sánh 2 mã</button>
                <button style={segBtn(mode === "scan", "#7c3aed")} onClick={() => switchMode("scan")}>📋 Quét danh sách</button>
              </div>
            </div>
          )}

          {/* ── GINGKO MODE CONTENT ── */}
          {brand !== "dantuong" && (<>

          {/* ── SINGLE MODE ── */}
          {mode === "single" && (
            <>
              <div style={inputBox(foc1)}>
                <span style={{ fontSize: 16 }}>🟡</span>
                <input
                  autoFocus
                  type="search" value={q1}
                  onChange={e => setQ1(e.target.value)}
                  onFocus={() => setFoc1(true)} onBlur={() => setFoc1(false)}
                  placeholder="Nhập mã màu: G622, 5860, 9030..."
                  style={{ flex: 1, border: "none", outline: "none", fontSize: 16, color: "#111", background: "transparent", fontFamily: "monospace", fontWeight: 600 }}
                />
                {q1 && <button onClick={() => setQ1("")} style={{ border: "none", background: "#f3f4f6", color: "#6b7280", borderRadius: "50%", width: 22, height: 22, cursor: "pointer", fontSize: 12, padding: 0 }}>✕</button>}
                {scrolled && (
                  <button onClick={() => setCollapsed(c => !c)} title={collapsed ? "Mở rộng" : "Thu gọn"} style={{ border: "1.5px solid #e5e7eb", background: collapsed ? "#f0fdf4" : "white", borderRadius: 16, padding: "3px 9px", cursor: "pointer", fontSize: 12, color: collapsed ? "#059669" : "#6b7280", fontWeight: 700, whiteSpace: "nowrap", flexShrink: 0 }}>
                    {collapsed ? "▼" : "▲"}
                  </button>
                )}
              </div>
              {!collapsed && q1 && (
                <div style={{ marginTop: 12 }}>
                  {hit1 ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#fef3c7", border: "1.5px solid #fde68a", borderRadius: 10, padding: "10px 14px" }}>
                      <span style={{ fontSize: 20 }}>✅</span>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "#92400e", fontFamily: "monospace" }}>{hit1.code}</div>
                        <div style={{ fontSize: 12, color: "#78716c" }}>Cột <b>{hit1.col}</b> · Hàng <b>{hit1.row + 1}</b> · {hit1.chartId === "ae" ? "Bảng A–E" : "Bảng P–T"}</div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#fef2f2", border: "1.5px solid #fecaca", borderRadius: 10, padding: "10px 14px" }}>
                      <span style={{ fontSize: 20 }}>❌</span>
                      <div style={{ fontSize: 13, color: "#dc2626" }}>Không tìm thấy mã &ldquo;{q1}&rdquo;</div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* ── COMPARE MODE ── */}
          {mode === "compare" && (
            <>
              <div style={inputBox(foc1)}>
                <span style={{ fontSize: 16 }}>🟡</span>
                <input
                  autoFocus type="search" value={q1}
                  onChange={e => setQ1(e.target.value)}
                  onFocus={() => setFoc1(true)} onBlur={() => setFoc1(false)}
                  placeholder="Mã màu 1..."
                  style={{ flex: 1, border: "none", outline: "none", fontSize: 15, color: "#111", background: "transparent", fontFamily: "monospace", fontWeight: 600 }}
                />
                {q1 && <button onClick={() => setQ1("")} style={{ border: "none", background: "#f3f4f6", color: "#6b7280", borderRadius: "50%", width: 22, height: 22, cursor: "pointer", fontSize: 12, padding: 0 }}>✕</button>}
                {scrolled && (
                  <button onClick={() => setCollapsed(c => !c)} title={collapsed ? "Mở rộng" : "Thu gọn"} style={{ border: "1.5px solid #e5e7eb", background: collapsed ? "#f0fdf4" : "white", borderRadius: 16, padding: "3px 9px", cursor: "pointer", fontSize: 12, color: collapsed ? "#059669" : "#6b7280", fontWeight: 700, whiteSpace: "nowrap", flexShrink: 0 }}>
                    {collapsed ? "▼" : "▲"}
                  </button>
                )}
              </div>
              {!collapsed && (<>
              <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "10px 0" }}>
                <div style={{ flex: 1, height: 1, background: "#f1f5f9" }} />
                <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 700 }}>SO SÁNH VỚI</span>
                <div style={{ flex: 1, height: 1, background: "#f1f5f9" }} />
              </div>
              <div style={inputBox(foc2, "#0ea5e9")}>
                <span style={{ fontSize: 16 }}>🔵</span>
                <input
                  type="search" value={q2}
                  onChange={e => setQ2(e.target.value)}
                  onFocus={() => setFoc2(true)} onBlur={() => setFoc2(false)}
                  placeholder="Mã màu 2..."
                  style={{ flex: 1, border: "none", outline: "none", fontSize: 15, color: "#111", background: "transparent", fontFamily: "monospace", fontWeight: 600 }}
                />
                {q2 && <button onClick={() => setQ2("")} style={{ border: "none", background: "#f3f4f6", color: "#6b7280", borderRadius: "50%", width: 22, height: 22, cursor: "pointer", fontSize: 12, padding: 0 }}>✕</button>}
              </div>

              {/* result chips */}
              {(q1 || q2) && (
                <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                  {[{ q: q1, h: hit1, icon: "🟡", bg: "#fef3c7", bd: "#fde68a", lbl: "#92400e" }, { q: q2, h: hit2, icon: "🔵", bg: "#e0f2fe", bd: "#bae6fd", lbl: "#075985" }]
                    .filter(x => x.q)
                    .map((x, i) => (
                      <div key={i} style={{ flex: 1, minWidth: 120, background: x.h ? x.bg : "#fef2f2", border: `1.5px solid ${x.h ? x.bd : "#fecaca"}`, borderRadius: 10, padding: "8px 12px", display: "flex", alignItems: "center", gap: 8 }}>
                        <span>{x.h ? x.icon : "❌"}</span>
                        {x.h ? (
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: x.lbl, fontFamily: "monospace" }}>{x.h.code}</div>
                            <div style={{ fontSize: 11, color: "#6b7280" }}>Cột {x.h.col} · Hàng {x.h.row + 1}</div>
                          </div>
                        ) : <div style={{ fontSize: 12, color: "#dc2626" }}>Không tìm thấy</div>}
                      </div>
                    ))}
                </div>
              )}
              {hit1 && hit2 && (
                <div style={{ marginTop: 10, background: "linear-gradient(135deg,#fef3c7,#e0f2fe)", border: "1.5px solid #fde68a", borderRadius: 10, padding: "10px 14px", display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, color: "#374151" }}>
                  ↔️ So sánh <span style={{ background: "#fde68a", borderRadius: 6, padding: "1px 8px", fontFamily: "monospace" }}>{hit1.code}</span> với <span style={{ background: "#bae6fd", borderRadius: 6, padding: "1px 8px", fontFamily: "monospace" }}>{hit2.code}</span>
                </div>
              )}
            </>)}
            </>
          )}

          {/* ── SCAN MODE ── */}
          {!collapsed && mode === "scan" && (
            <>
              <p style={{ margin: "0 0 10px", fontSize: 13, color: "#6b7280", lineHeight: 1.5 }}>
                Dán danh sách mã chỉ vào đây (ví dụ: <span style={{ fontFamily: "monospace", background: "#f1f5f9", padding: "1px 6px", borderRadius: 4 }}>R=G721, P=G921, Y=5675</span>). App sẽ tìm và khoanh tất cả mã có trong bảng.
              </p>
              <textarea
                autoFocus
                value={scanText}
                onChange={e => setScanText(e.target.value)}
                placeholder={"Ví dụ:\nR=G721, P=G921, Y=5675\nC=G915, C=9030, B=G826"}
                rows={4}
                style={{
                  width: "100%", border: "2px solid #e5e7eb", borderRadius: 12, padding: "12px 14px",
                  fontSize: 14, fontFamily: "monospace", color: "#111", resize: "vertical",
                  outline: "none", boxSizing: "border-box", lineHeight: 1.6,
                  transition: "border 0.2s",
                }}
                onFocus={e => e.target.style.borderColor = "#7c3aed"}
                onBlur={e => e.target.style.borderColor = "#e5e7eb"}
              />

              {scanCodes.length > 0 && (
                <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {scanFound.length > 0 && (
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#f0fdf4", border: "1.5px solid #86efac", borderRadius: 10, padding: "7px 12px" }}>
                      <span style={{ fontSize: 15 }}>✅</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#15803d" }}>
                        {scanFound.length} mã tìm thấy
                      </span>
                      <span style={{ fontSize: 11, color: "#6b7280" }}>→ xem danh sách bên phải</span>
                    </div>
                  )}
                  {scanMissed.length > 0 && (
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#dc2626", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                        ❌ Không có trong bảng
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                        {scanMissed.map((c, i) => (
                          <span key={i} style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 7, padding: "3px 9px", fontSize: 11, fontWeight: 600, color: "#dc2626", fontFamily: "monospace" }}>
                            {c}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          </>)}

          {/* ── DANH TƯỜNG placeholder ── */}
          {brand === "dantuong" && (
            <div style={{ padding: "28px 0 20px", textAlign: "center", color: "#9ca3af" }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>🪡</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#374151", marginBottom: 6 }}>Chỉ danh tường</div>
              <div style={{ fontSize: 13, color: "#9ca3af", lineHeight: 1.6 }}>
                Dữ liệu bảng màu chỉ danh tường<br/>đang được cập nhật.
              </div>
              <div style={{ marginTop: 16, display: "inline-block", background: "#f1f5f9", borderRadius: 8, padding: "6px 16px", fontSize: 12, color: "#6b7280" }}>
                Sắp ra mắt
              </div>
            </div>
          )}

        </div>
      </div>
      </div>

      {/* ── BACK TO TOP ── */}
      {scrolled && (
        <button
          onClick={() => topRef.current?.scrollIntoView({ behavior: "smooth" })}
          style={{
            position: "fixed", right: 16, bottom: 28, zIndex: 200,
            width: 44, height: 44, borderRadius: "50%",
            background: "linear-gradient(135deg, #065f46, #059669)",
            border: "none", cursor: "pointer",
            boxShadow: "0 4px 16px rgba(5,150,105,0.45)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 20, color: "white",
            transition: "opacity 0.25s, transform 0.25s",
          }}
          title="Về đầu trang"
        >⬆</button>
      )}

      {/* ── CHARTS ── */}
      {brand !== "dantuong" && <main style={{ maxWidth: 640, margin: "0 auto", padding: "24px 16px 40px" }}>
        {CHARTS.map((chart) => {
          const chartPins = pins.filter(p => p.hit.chartId === chart.id);
          const isActive = chartPins.length > 0;
          const isFocused = focusedScan?.chartId === chart.id;
          return (
            <div
              key={chart.id}
              ref={el => { chartRefs.current[chart.id] = el; }}
              style={{ marginBottom: 28 }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <div style={{ width: 3, height: 18, borderRadius: 2, background: isActive ? "#059669" : "#d1fae5" }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: isActive ? "#065f46" : "#9ca3af", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  {chart.label}
                </span>
                {isActive && mode === "scan" && (
                  <span style={{ background: "#fef3c7", border: "1px solid #fde68a", borderRadius: 8, padding: "2px 9px", fontSize: 11, fontWeight: 700, color: "#92400e" }}>
                    🟡 {chartPins.length} mã
                  </span>
                )}
                {isActive && mode !== "scan" && chartPins.map((p, i) => (
                  <span key={i} style={{
                    background: i === 0 ? "#fef3c7" : "#e0f2fe",
                    border: `1px solid ${i === 0 ? "#fde68a" : "#bae6fd"}`,
                    borderRadius: 8, padding: "2px 9px",
                    fontSize: 11, fontWeight: 700,
                    color: i === 0 ? "#92400e" : "#075985",
                    fontFamily: "monospace",
                  }}>
                    {i === 0 ? "🟡" : "🔵"} {p.hit.code}
                  </span>
                ))}
              </div>
              <div style={{
                borderRadius: 16, overflow: "hidden",
                boxShadow: isFocused
                  ? "0 0 0 3px #f59e0b, 0 12px 36px rgba(245,158,11,0.25)"
                  : isActive
                    ? "0 0 0 2px #059669, 0 12px 36px rgba(5,150,105,0.18)"
                    : "0 2px 12px rgba(0,0,0,0.08)",
                border: `2px solid ${isFocused ? "#f59e0b" : isActive ? "#059669" : "transparent"}`,
                transition: "all 0.35s cubic-bezier(0.4,0,0.2,1)",
                background: "#fff",
              }}>
                <ChartImage chart={chart} pins={chartPins} focusedCode={mode === "scan" ? focusedScan?.code ?? null : null} />
              </div>
            </div>
          );
        })}
      </main>}

      {/* ── FLOATING PANEL: scan found codes ── */}
      {brand !== "dantuong" && mode === "scan" && scanFound.length > 0 && (
        <div style={{
          position: "fixed", right: 10, top: "50%", transform: "translateY(-50%)",
          width: 88, zIndex: 50,
          background: "white",
          borderRadius: 14,
          boxShadow: "0 8px 28px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.1)",
          border: "1.5px solid #e5e7eb",
          display: "flex", flexDirection: "column",
          maxHeight: "70vh", overflow: "hidden",
        }}>
          <div style={{
            padding: "8px 6px 6px", textAlign: "center",
            borderBottom: "1px solid #f1f5f9",
            background: "#f0fdf4",
            borderRadius: "12px 12px 0 0",
          }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: "#059669", letterSpacing: "0.04em" }}>✅ {scanFound.length} MÃ</div>
            <div style={{ fontSize: 9, color: "#9ca3af", marginTop: 1 }}>Bấm để xem</div>
          </div>
          <div style={{ overflow: "auto", padding: "6px 5px", display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
            {scanFound.map((h, i) => {
              const isSelected = focusedScan?.code === h.code;
              return (
                <button
                  key={i}
                  onClick={() => scrollToCode(h)}
                  title={`Cột ${h.col} · Hàng ${h.row + 1}`}
                  style={{
                    border: "1.5px solid",
                    borderColor: isSelected ? "#059669" : "#fde68a",
                    borderRadius: 8,
                    padding: "5px 3px",
                    fontSize: 10.5,
                    fontWeight: 700,
                    fontFamily: "monospace",
                    cursor: "pointer",
                    background: isSelected ? "#059669" : "#fef3c7",
                    color: isSelected ? "white" : "#92400e",
                    textAlign: "center",
                    transition: "all 0.18s",
                    width: "100%",
                    lineHeight: 1.3,
                    wordBreak: "break-all",
                  }}
                >
                  {h.code}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ textAlign: "center", padding: "20px 16px", borderTop: "1px solid #e5e7eb", background: "white", fontSize: 12, color: "#9ca3af" }}>
        Gingko Brand High-Grade Embroidery Thread · 100% Polyester
      </div>

      <style>{`
        @keyframes pa {
          0%,100% { box-shadow: 0 0 0 2.5px #f59e0b, 0 0 10px rgba(245,158,11,0.55); }
          50%      { box-shadow: 0 0 0 4px   #f59e0b, 0 0 22px rgba(245,158,11,0.85); }
        }
        @keyframes pb {
          0%,100% { box-shadow: 0 0 0 2.5px #0ea5e9, 0 0 10px rgba(14,165,233,0.5); }
          50%      { box-shadow: 0 0 0 4px   #0ea5e9, 0 0 22px rgba(14,165,233,0.8); }
        }
        @keyframes pc {
          0%,100% { box-shadow: 0 0 0 2.5px #059669, 0 0 10px rgba(5,150,105,0.6); }
          50%      { box-shadow: 0 0 0 5px   #059669, 0 0 24px rgba(5,150,105,0.9); }
        }
        input[type="search"]::-webkit-search-cancel-button { display: none; }
        * { box-sizing: border-box; }
      `}</style>
    </div>
  );
}
