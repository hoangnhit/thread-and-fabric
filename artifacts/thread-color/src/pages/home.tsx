import { useState, useRef, useEffect, useCallback, CSSProperties } from "react";
import { useLocation } from "wouter";
import { useTheme, mkTheme } from "@/contexts/ThemeContext";
import { createWorker } from "tesseract.js";

/* ─── DATA ─────────────────────────────────────────────────────── */
const CHART_CONFIG = {
  fj: { imageW: 2694, imageH: 3006, topY: 200, rowH: 140 },
  ko: { imageW: 2749, imageH: 3000, topY: 200, rowH: 140 },
};

function rowYPct(chartId: "fj" | "ko", i: number) {
  const { topY, rowH, imageH } = CHART_CONFIG[chartId];
  return (topY + (i + 0.5) * rowH) / imageH;
}

const CHARTS = [
  {
    id: "fj" as const, file: "/thread-chart-fj.jpg", label: "Bảng F – J",
    columns: [
      { name: "F", xPct: 0.059, codes: ["G529","G629","G911","G731","G630","G627","G712","G711","G831","G631","G834","G832","G880","G633","G680","G922","G709","G787","5800","G710"] },
      { name: "G", xPct: 0.236, codes: ["G941","G998","G720","G785","G789","G788","G833","G719","G835","G635","5568","G982","5519","G638","G974","G981","G784","G567","G999","G887"] },
      { name: "H", xPct: 0.456, codes: ["G532","G830","G933","G943","9031","G930","5728","G722","G553","G634","G632","5602","G326","G642","G842","5510","G676","G566","G766","G767"] },
      { name: "I", xPct: 0.653, codes: ["G562","G531","G829","G934","5580","G843","G022","9171","G743","G966","5740","G967","G555","O0673","G976","G643","G944","G574","G844","5687"] },
      { name: "J", xPct: 0.852, codes: ["G550","G953","G874","G674","G628","G675","G542","G871","G528","5733","G828","G960","G671","G775","G961","G776","G964","G963","G975","G764"] },
    ],
  },
  {
    id: "ko" as const, file: "/thread-chart-ko.jpg", label: "Bảng K – O",
    columns: [
      { name: "K", xPct: 0.076, codes: ["G692","9138","G594","G892","G932","G827","G893","9052","G694","G593","G895","G852","G977","G695","G577","G797","5801","G992","G896","G762"] },
      { name: "L", xPct: 0.250, codes: ["G647","G845","9141","G645","G847","G746","G799","G888","G846","G685","G991","G890","9102","G652","G868","G989","G849","G751","G580","G780"] },
      { name: "M", xPct: 0.461, codes: ["G541","G940","G748","G702","G900","G768","G648","G848","G968","G769","G770","G649","5620","G701","G749","G988","G650","G651","9091","O0555"] },
      { name: "N", xPct: 0.654, codes: ["G920","G552","G809","G684","G939","G568","G956","G706","G759","G790","G793","G757","G569","G969","G796","G756","G794","G957","G795","G905"] },
      { name: "O", xPct: 0.845, codes: ["G578","G668","G904","G879","G851","G979","G750","G703","G985","G970","G902","G903","G690","G704","G891","G677","G669","G996","G798","G705"] },
    ],
  },
];

type Hit = { chartId: "fj" | "ko"; col: string; row: number; code: string };

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
  { border: "#f59e0b", anim: "pa" },
  { border: "#0ea5e9", anim: "pb" },
];
const SCAN_STYLE  = { border: "#f59e0b", anim: "pa" };
const FOCUSED_SCAN_STYLE = { border: "#059669", anim: "pc" };

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

  const pinnedCodes = new Set(pins.map(p => p.hit.code));
  const isFocusedScan = (code: string) => focusedCode != null && code === focusedCode;
  const getPinStyle = (code: string) => pins.find(p => p.hit.code === code)?.slotStyle;

  return (
    <div style={{ overflow: "hidden", position: "relative", borderRadius: 14 }}>
      <div ref={wrapRef} style={{ position: "relative" }}>
        <img
          src={`${import.meta.env.BASE_URL}${chart.file.replace(/^\//, "")}`} alt={chart.label}
          style={{ display: "block", width: "100%", userSelect: "none" }}
          onLoad={() => {
            const img = wrapRef.current?.querySelector("img");
            if (img) setSize({ w: img.offsetWidth, h: img.offsetHeight });
          }}
        />
        {size.w > 0 && chart.columns.flatMap(col =>
          col.codes.map((code, row) => {
            const cx = col.xPct * size.w;
            const cy = rowYPct(chart.id, row) * size.h;
            const pinStyle = getPinStyle(code);
            const focused = isFocusedScan(code);
            const highlighted = pinnedCodes.has(code);
            const s = focused ? FOCUSED_SCAN_STYLE : (pinStyle ?? null);
            const badgeH = Math.max(14, (CHART_CONFIG[chart.id].rowH * 0.52 / CHART_CONFIG[chart.id].imageH) * size.h);
            const fontSize = Math.max(8, Math.min(12, badgeH * 0.62));
            return (
              <div key={`badge-${col.name}-${row}`} style={{
                position: "absolute",
                left: cx,
                top: cy,
                transform: "translate(-50%, -50%)",
                padding: `${fontSize * 0.18}px ${fontSize * 0.55}px`,
                borderRadius: 4,
                fontSize,
                fontWeight: highlighted || focused ? 800 : 700,
                fontFamily: "monospace",
                whiteSpace: "nowrap",
                pointerEvents: "none",
                zIndex: (highlighted || focused) ? 10 : 1,
                lineHeight: 1,
                background: focused
                  ? "rgba(5,150,105,0.92)"
                  : highlighted
                    ? (s?.border === "#0ea5e9" ? "rgba(14,165,233,0.92)" : "rgba(245,158,11,0.95)")
                    : "rgba(255,255,255,0.96)",
                color: (highlighted || focused) ? "#fff" : "#111",
                boxShadow: (highlighted || focused)
                  ? `0 0 0 1.5px ${s?.border ?? "#f59e0b"}, 0 2px 10px ${s?.border ?? "#f59e0b"}99`
                  : "0 1px 3px rgba(0,0,0,0.25)",
                animation: s ? `${s.anim} 1.4s ease-in-out infinite` : "none",
              }}>
                {code}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

/* ─── MAIN ──────────────────────────────────────────────────────── */
export default function Home() {
  const { isDark } = useTheme();
  const t = mkTheme(isDark);
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

  // OCR state
  const [ocrImg, setOcrImg] = useState<string | null>(null);
  const [ocrStatus, setOcrStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [ocrProgress, setOcrProgress] = useState(0);
  const ocrFileRef = useRef<HTMLInputElement>(null);

  const handleOcrFile = useCallback(async (file: File) => {
    const url = URL.createObjectURL(file);
    setOcrImg(url);
    setOcrStatus("running");
    setOcrProgress(0);
    try {
      const worker = await createWorker("eng", 1, {
        logger: (m: { status: string; progress: number }) => {
          if (m.status === "recognizing text") setOcrProgress(Math.round(m.progress * 100));
        },
      });
      const { data } = await worker.recognize(url);
      await worker.terminate();
      setScanText(prev => prev ? prev + "\n" + data.text : data.text);
      setOcrStatus("done");
    } catch {
      setOcrStatus("error");
    }
  }, []);

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
    setOcrImg(null); setOcrStatus("idle"); setOcrProgress(0);
  }, []);

  /* main tab style */
  const mainTab = (active: boolean, color: string) => ({
    flex: 1, padding: "9px 10px", border: "none",
    borderBottom: active ? `2.5px solid ${color}` : "2.5px solid transparent",
    marginBottom: -1, cursor: "pointer",
    fontSize: 13, fontWeight: active ? 700 : 500,
    color: active ? color : t.muted,
    background: "transparent", transition: "all 0.15s",
    whiteSpace: "nowrap" as const,
  });

  /* segmented control button */
  const segBtn = (active: boolean, color = "#059669"): CSSProperties => ({
    flex: 1, padding: "6px 8px", border: "none", cursor: "pointer",
    borderRadius: 7, fontSize: 12, fontWeight: active ? 700 : 500,
    background: active ? t.segActive : "transparent",
    color: active ? color : t.muted,
    boxShadow: active ? "0 1px 4px rgba(0,0,0,0.12), 0 0 0 0.5px rgba(0,0,0,0.04)" : "none",
    transition: "all 0.18s", whiteSpace: "nowrap" as const,
  });

  const inputBox = (focused: boolean, accent = "#f59e0b") => ({
    display: "flex", alignItems: "center", gap: 10,
    background: t.inputBg,
    border: `2px solid ${focused ? accent : t.inputBorder}`,
    borderRadius: 12, padding: "11px 14px",
    boxShadow: focused ? `0 0 0 4px ${accent}30` : "0 1px 4px rgba(0,0,0,0.07)",
    transition: "all 0.2s",
  });

  return (
    <div ref={topRef} style={{ minHeight: "100vh", background: t.bg, fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif" }}>

      {/* ── HERO ── */}
      <div style={{
        backgroundImage: "url(https://i.pinimg.com/736x/7b/ff/14/7bff148d3a7ce0c7d9efabd332745075.jpg)",
        backgroundSize: "cover", backgroundPosition: "center",
        padding: "28px 20px 48px", position: "relative", overflow: "hidden",
      }}>
        <div style={{ position: "absolute", inset: 0, background: "rgba(4,20,12,0.62)", zIndex: 0 }} />
        <div style={{ position: "absolute", top: -40, right: -40, width: 180, height: 180, borderRadius: "50%", background: "rgba(255,255,255,0.04)", zIndex: 0 }} />
        <div style={{ position: "absolute", bottom: -20, left: 20, width: 100, height: 100, borderRadius: "50%", background: "rgba(255,255,255,0.05)", zIndex: 0 }} />
        <div style={{ maxWidth: 640, margin: "0 auto", position: "relative", zIndex: 1, textAlign: "center" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "rgba(255,255,255,0.12)", borderRadius: 20, padding: "4px 14px", marginBottom: 14, fontSize: 11, color: "rgba(255,255,255,0.85)", letterSpacing: "0.1em", fontWeight: 700 }}>
            <img src={`${import.meta.env.BASE_URL}thienduc-logo.png`} alt="logo" style={{ width: 18, height: 18, objectFit: "contain", borderRadius: 3 }} />
            THIÊN ĐỨC HATS
          </div>
          <h1 style={{ margin: "0 0 6px", fontSize: 26, fontWeight: 800, color: "white", letterSpacing: "-0.02em" }}>
            Tra Cứu Màu Chỉ Thêu
          </h1>
        </div>
      </div>

      {/* ── MAIN CARD ── */}
      <div style={{
        position: "sticky", top: 0, zIndex: 50,
        background: scrolled ? t.scrolledNavBg : "transparent",
        paddingTop: scrolled ? 8 : 0,
        transition: "background 0.2s, padding 0.2s",
      }}>
      <div style={{ maxWidth: 640, margin: scrolled ? "0 auto" : "-28px auto 0", padding: "0 16px", position: "relative", zIndex: 10, transition: "margin 0.2s" }}>
        <div style={{
          background: t.card,
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
              <div style={{ display: "flex", borderBottom: `1px solid ${t.border}`, marginBottom: 14, alignItems: "center" }}>
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
              <div style={{ display: "flex", background: t.seg, borderRadius: 9, padding: 3, gap: 2, marginBottom: 8 }}>
                <button style={segBtn(brand === "all", "#374151")} onClick={() => setBrand("all")}>Tất cả</button>
                <button style={segBtn(brand === "gingko", "#059669")} onClick={() => setBrand("gingko")}>🧵 Chỉ GINGKO</button>
                <button style={segBtn(brand === "dantuong", "#3b82f6")} onClick={() => setBrand("dantuong")}>🪡 Chỉ danh tường</button>
              </div>

              {/* Tier 3 — mode segmented control */}
              <div style={{ display: "flex", background: t.seg, borderRadius: 9, padding: 3, gap: 2, marginBottom: 18 }}>
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
                  style={{ flex: 1, border: "none", outline: "none", fontSize: 16, color: t.text, background: "transparent", fontFamily: "monospace", fontWeight: 600 }}
                />
                {q1 && <button onClick={() => setQ1("")} style={{ border: "none", background: t.seg, color: t.text2, borderRadius: "50%", width: 22, height: 22, cursor: "pointer", fontSize: 12, padding: 0 }}>✕</button>}
                {scrolled && (
                  <button onClick={() => setCollapsed(c => !c)} title={collapsed ? "Mở rộng" : "Thu gọn"} style={{ border: `1.5px solid ${t.border}`, background: collapsed ? "#f0fdf4" : t.card, borderRadius: 16, padding: "3px 9px", cursor: "pointer", fontSize: 12, color: collapsed ? "#059669" : t.text2, fontWeight: 700, whiteSpace: "nowrap", flexShrink: 0 }}>
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
                        <div style={{ fontSize: 12, color: "#78716c" }}>Cột <b>{hit1.col}</b> · Hàng <b>{hit1.row + 1}</b> · {hit1.chartId === "fj" ? "Bảng F–J" : "Bảng K–O"}</div>
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
                  style={{ flex: 1, border: "none", outline: "none", fontSize: 15, color: t.text, background: "transparent", fontFamily: "monospace", fontWeight: 600 }}
                />
                {q1 && <button onClick={() => setQ1("")} style={{ border: "none", background: t.seg, color: t.text2, borderRadius: "50%", width: 22, height: 22, cursor: "pointer", fontSize: 12, padding: 0 }}>✕</button>}
                {scrolled && (
                  <button onClick={() => setCollapsed(c => !c)} title={collapsed ? "Mở rộng" : "Thu gọn"} style={{ border: `1.5px solid ${t.border}`, background: collapsed ? "#f0fdf4" : t.card, borderRadius: 16, padding: "3px 9px", cursor: "pointer", fontSize: 12, color: collapsed ? "#059669" : t.text2, fontWeight: 700, whiteSpace: "nowrap", flexShrink: 0 }}>
                    {collapsed ? "▼" : "▲"}
                  </button>
                )}
              </div>
              {!collapsed && (<>
              <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "10px 0" }}>
                <div style={{ flex: 1, height: 1, background: t.border }} />
                <span style={{ fontSize: 11, color: t.muted, fontWeight: 700 }}>SO SÁNH VỚI</span>
                <div style={{ flex: 1, height: 1, background: t.border }} />
              </div>
              <div style={inputBox(foc2, "#0ea5e9")}>
                <span style={{ fontSize: 16 }}>🔵</span>
                <input
                  type="search" value={q2}
                  onChange={e => setQ2(e.target.value)}
                  onFocus={() => setFoc2(true)} onBlur={() => setFoc2(false)}
                  placeholder="Mã màu 2..."
                  style={{ flex: 1, border: "none", outline: "none", fontSize: 15, color: t.text, background: "transparent", fontFamily: "monospace", fontWeight: 600 }}
                />
                {q2 && <button onClick={() => setQ2("")} style={{ border: "none", background: t.seg, color: t.text2, borderRadius: "50%", width: 22, height: 22, cursor: "pointer", fontSize: 12, padding: 0 }}>✕</button>}
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
              {/* ── OCR image upload ── */}
              <input
                ref={ocrFileRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={e => { if (e.target.files?.[0]) handleOcrFile(e.target.files[0]); e.target.value = ""; }}
              />
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <button
                    onClick={() => ocrFileRef.current?.click()}
                    disabled={ocrStatus === "running"}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 6,
                      padding: "7px 14px", border: "1.5px solid #7c3aed",
                      borderRadius: 10, cursor: ocrStatus === "running" ? "not-allowed" : "pointer",
                      background: ocrStatus === "running" ? "#ede9fe" : "#f5f3ff",
                      color: "#6d28d9", fontSize: 13, fontWeight: 700,
                      transition: "all 0.15s",
                      opacity: ocrStatus === "running" ? 0.7 : 1,
                    }}
                  >
                    📷 {ocrStatus === "running" ? `Đang nhận diện... ${ocrProgress}%` : "Nhận diện từ ảnh"}
                  </button>
                  {ocrImg && ocrStatus !== "running" && (
                    <button
                      onClick={() => { setOcrImg(null); setOcrStatus("idle"); setOcrProgress(0); }}
                      style={{ border: "none", background: "transparent", color: "#9ca3af", cursor: "pointer", fontSize: 12, padding: "4px 6px", borderRadius: 6 }}
                    >✕ Xoá ảnh</button>
                  )}
                </div>

                {ocrStatus === "running" && (
                  <div style={{ marginTop: 8, height: 6, background: "#ede9fe", borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${ocrProgress}%`, background: "linear-gradient(90deg,#7c3aed,#a78bfa)", borderRadius: 4, transition: "width 0.3s" }} />
                  </div>
                )}

                {ocrStatus === "done" && (
                  <div style={{ marginTop: 8, fontSize: 12, color: "#15803d", fontWeight: 600 }}>
                    ✅ Nhận diện xong — các mã được thêm vào bên dưới
                  </div>
                )}
                {ocrStatus === "error" && (
                  <div style={{ marginTop: 8, fontSize: 12, color: "#dc2626", fontWeight: 600 }}>
                    ❌ Không thể đọc ảnh. Thử lại hoặc nhập mã thủ công.
                  </div>
                )}

                {ocrImg && (
                  <div style={{ marginTop: 8, position: "relative", display: "inline-block", borderRadius: 10, overflow: "hidden", border: "1.5px solid #c4b5fd" }}>
                    <img
                      src={ocrImg}
                      alt="OCR source"
                      style={{ display: "block", maxWidth: "100%", maxHeight: 180, objectFit: "contain" }}
                    />
                    {ocrStatus === "running" && (
                      <div style={{ position: "absolute", inset: 0, background: "rgba(109,40,217,0.22)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <span style={{ background: "rgba(109,40,217,0.85)", color: "white", borderRadius: 8, padding: "4px 12px", fontSize: 13, fontWeight: 700 }}>
                          {ocrProgress}%
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <p style={{ margin: "0 0 10px", fontSize: 13, color: "#6b7280", lineHeight: 1.5 }}>
                Hoặc dán danh sách mã chỉ vào đây (ví dụ: <span style={{ fontFamily: "monospace", background: "#f1f5f9", padding: "1px 6px", borderRadius: 4 }}>R=G721, P=G921, Y=5675</span>)
              </p>
              <textarea
                autoFocus
                value={scanText}
                onChange={e => setScanText(e.target.value)}
                placeholder={"Ví dụ:\nR=G721, P=G921, Y=5675\nC=G915, C=9030, B=G826"}
                rows={4}
                style={{
                  width: "100%", border: `2px solid ${t.inputBorder}`, borderRadius: 12, padding: "12px 14px",
                  fontSize: 14, fontFamily: "monospace", color: t.text, resize: "vertical",
                  outline: "none", boxSizing: "border-box", lineHeight: 1.6,
                  background: t.inputBg, transition: "border 0.2s",
                }}
                onFocus={e => e.target.style.borderColor = "#7c3aed"}
                onBlur={e => e.target.style.borderColor = t.inputBorder}
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
            <div style={{ padding: "28px 0 20px", textAlign: "center", color: t.muted }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>🪡</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: t.text, marginBottom: 6 }}>Chỉ danh tường</div>
              <div style={{ fontSize: 13, color: t.muted, lineHeight: 1.6 }}>
                Dữ liệu bảng màu chỉ danh tường<br/>đang được cập nhật.
              </div>
              <div style={{ marginTop: 16, display: "inline-block", background: t.seg, borderRadius: 8, padding: "6px 16px", fontSize: 12, color: t.text2 }}>
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
                <div style={{ width: 3, height: 18, borderRadius: 2, background: isActive ? "#059669" : isDark ? "#1a3a2a" : "#d1fae5" }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: isActive ? "#065f46" : t.muted, textTransform: "uppercase", letterSpacing: "0.1em" }}>
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
                background: t.card,
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
          background: t.card,
          borderRadius: 14,
          boxShadow: "0 8px 28px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.1)",
          border: `1.5px solid ${t.border}`,
          display: "flex", flexDirection: "column",
          maxHeight: "70vh", overflow: "hidden",
        }}>
          <div style={{
            padding: "8px 6px 6px", textAlign: "center",
            borderBottom: `1px solid ${t.border}`,
            background: isDark ? "#1a3a2a" : "#f0fdf4",
            borderRadius: "12px 12px 0 0",
          }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: "#059669", letterSpacing: "0.04em" }}>✅ {scanFound.length} MÃ</div>
            <div style={{ fontSize: 9, color: t.muted, marginTop: 1 }}>Bấm để xem</div>
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

      {/* ── FLOATING CONTACT ── */}
      <div style={{ position: "fixed", bottom: 20, left: 16, zIndex: 100, display: "flex", flexDirection: "column", gap: 10 }}>
        {/* Zalo */}
        <a href="https://zalo.me/0969896403" target="_blank" rel="noopener noreferrer"
          title="Liên hệ Zalo"
          style={{ width: 48, height: 48, borderRadius: 14, background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none", transition: "transform 0.18s", filter: "drop-shadow(0 4px 10px rgba(0,104,255,0.5))" }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "scale(1.12)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = "scale(1)"; }}
        >
          <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/9/91/Icon_of_Zalo.svg/960px-Icon_of_Zalo.svg.png" alt="Zalo" style={{ width: 48, height: 48, borderRadius: 14, objectFit: "cover" }} />
        </a>
        {/* WhatsApp */}
        <a href="https://wa.me/84969896403" target="_blank" rel="noopener noreferrer"
          title="Liên hệ WhatsApp"
          style={{ width: 48, height: 48, borderRadius: "50%", background: "#25d366", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 14px rgba(37,211,102,0.45)", textDecoration: "none", transition: "transform 0.18s, box-shadow 0.18s" }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "scale(1.12)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 6px 20px rgba(37,211,102,0.6)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = "scale(1)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 14px rgba(37,211,102,0.45)"; }}
        >
          <svg width="26" height="26" viewBox="0 0 32 32" fill="white">
            <path d="M16 2C8.268 2 2 8.268 2 16c0 2.455.663 4.756 1.816 6.733L2 30l7.463-1.787A13.94 13.94 0 0016 30c7.732 0 14-6.268 14-14S23.732 2 16 2zm0 25.5a11.45 11.45 0 01-5.845-1.604l-.42-.248-4.43 1.061 1.094-4.314-.273-.443A11.46 11.46 0 014.5 16C4.5 9.649 9.649 4.5 16 4.5S27.5 9.649 27.5 16 22.351 27.5 16 27.5zm6.29-8.61c-.345-.172-2.04-1.006-2.356-1.12-.316-.115-.547-.172-.777.172s-.892 1.12-1.093 1.35c-.2.23-.4.258-.746.086-.345-.172-1.457-.537-2.775-1.713-1.026-.915-1.718-2.044-1.92-2.389-.2-.345-.021-.531.151-.703.155-.154.345-.402.517-.603.172-.2.23-.345.345-.575.115-.23.058-.431-.029-.603-.086-.172-.777-1.872-1.064-2.561-.28-.672-.564-.58-.777-.592l-.661-.011c-.23 0-.603.086-.919.431-.316.345-1.207 1.178-1.207 2.872s1.236 3.33 1.408 3.56c.172.23 2.432 3.71 5.893 5.202.824.355 1.467.568 1.969.728.827.263 1.58.226 2.174.137.663-.1 2.04-.834 2.327-1.638.287-.804.287-1.493.2-1.638-.086-.144-.316-.23-.661-.402z"/>
          </svg>
        </a>
      </div>

      {/* ── FOOTER ── */}
      <div style={{ textAlign: "center", padding: "20px 16px 28px", color: t.muted, fontSize: 11, letterSpacing: "0.08em", fontWeight: 500 }}>
        DESIGNED by NGUYEN HUU HOANG
      </div>
    </div>
  );
}
