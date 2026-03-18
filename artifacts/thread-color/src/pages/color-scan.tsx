import { useState, useRef, useEffect, useCallback } from "react";

const CHART_CONFIG = {
  ae: { imageW: 1158, imageH: 1280, topY: 35, rowH: 62 },
  pt: { imageW: 960,  imageH: 1280, topY: 215, rowH: 52 },
};

const CHARTS = [
  {
    id: "ae" as const, file: "/thread-chart-ae.jpg",
    columns: [
      { name: "A", xPct: 0.045, codes: ["G622","G661","G561","G666","G866","G861","G727","G735","G626","9003","5860","G683","G623","G924","G980","G724","G971","9001","G024","G624"] },
      { name: "B", xPct: 0.240, codes: ["G826","G755","5695","G771","5766","G955","G172","5763","G951","G725","G772","G625","G869","G763","G765","G778","G965","G678","9072","G987"] },
      { name: "C", xPct: 0.438, codes: ["G713","G818","G816","9030","G915","G815","G549","G819","5675","G948","G921","G548","G994","G721","G584","G990","G754","G734","G910","G993"] },
      { name: "D", xPct: 0.638, codes: ["G653","G882","G853","G752","G820","G817","G620","G777","G616","G952","G521","G621","5767","G588","G779","G919","G917","G508","5732","G984"] },
      { name: "E", xPct: 0.835, codes: ["G878","G509","G637","5566","G839","G838","G747","5629","00344","G681","G707","G986","G639","G786","G821","G781","G899","5634","G782","G783"] },
    ],
  },
  {
    id: "pt" as const, file: "/thread-chart-pt.jpg",
    columns: [
      { name: "P", xPct: 0.078, codes: ["G554","G723","G927","5776","G060","G938","G660","G573","G656","G926","9132","G527","G855","G884","G556","9086","G885","G729","G854","G736"] },
      { name: "Q", xPct: 0.255, codes: ["G526","G670","G870","G673","G538","G792","G791","G672","G726","G753","G773","G856","G898","G657","G973","G857","5788","G942","G658","G858"] },
      { name: "R", xPct: 0.432, codes: ["G686","G949","G822","G582","G682","G863","G738","G860","G535","G862","G728","G928","G730","G906","G758","G565","G958","G945","G654","5551"] },
      { name: "S", xPct: 0.609, codes: ["G592","G563","G687","G610","G810","G886","G811","G505","G718","G812","G611","5783","G545","O0939","G761","G613","G612","G212","G918","G572"] },
      { name: "T", xPct: 0.781, codes: ["O0919","G575","G615","G502","G840","G614","G740","G618","G689","G539","G662","G936","G741","G664","G619","G640","G544","G841","G760","G540"] },
    ],
  },
];

type ThreadColor = { code: string; col: string; r: number; g: number; b: number };
type Match = ThreadColor & { dist: number };

function rowYPct(chartId: "ae" | "pt", row: number) {
  const { topY, rowH, imageH } = CHART_CONFIG[chartId];
  return (topY + (row + 0.5) * rowH) / imageH;
}

function colorDist(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number) {
  const dr = r1 - r2, dg = g1 - g2, db = b1 - b2;
  return Math.sqrt(2 * dr * dr + 4 * dg * dg + 3 * db * db);
}

function toHex(r: number, g: number, b: number) {
  return "#" + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, "0")).join("");
}

function similarity(dist: number): number {
  return Math.max(0, Math.round(100 - (dist / 5.5)));
}

export default function ColorScan() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const sampleCanvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);

  const [threadColors, setThreadColors] = useState<ThreadColor[]>([]);
  const [loading, setLoading] = useState(true);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [scanned, setScanned] = useState<{ r: number; g: number; b: number } | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [frozen, setFrozen] = useState(false);

  /* ── Extract thread colors from chart images ── */
  useEffect(() => {
    let cancelled = false;
    async function extract() {
      const all: ThreadColor[] = [];
      for (const chart of CHARTS) {
        try {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.src = chart.file;
          await new Promise<void>((res, rej) => {
            img.onload = () => res();
            img.onerror = () => rej(new Error("img load fail"));
          });
          const { imageW, imageH } = CHART_CONFIG[chart.id];
          const cv = document.createElement("canvas");
          cv.width = imageW; cv.height = imageH;
          const ctx = cv.getContext("2d", { willReadFrequently: true })!;
          ctx.drawImage(img, 0, 0, imageW, imageH);
          for (const col of chart.columns) {
            col.codes.forEach((code, row) => {
              const xPx = Math.round(col.xPct * imageW);
              const yPx = Math.round(rowYPct(chart.id, row) * imageH);
              const R = 6;
              const d = ctx.getImageData(xPx - R, yPx - R, R * 2, R * 2).data;
              let r = 0, g = 0, b = 0;
              for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
              const n = d.length / 4;
              all.push({ code, col: col.name, r: r / n, g: g / n, b: b / n });
            });
          }
        } catch { /* skip chart if CORS issue */ }
      }
      if (!cancelled) { setThreadColors(all); setLoading(false); }
    }
    extract();
    return () => { cancelled = true; };
  }, []);

  /* ── Start camera ── */
  const startCamera = useCallback(async () => {
    setCameraError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraOn(true);
    } catch (e: unknown) {
      setCameraError((e as Error).message ?? "Không mở được camera");
    }
  }, []);

  /* ── Stop camera ── */
  const stopCamera = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setCameraOn(false);
    setFrozen(false);
  }, []);

  /* ── Sample loop ── */
  useEffect(() => {
    if (!cameraOn || frozen || threadColors.length === 0) return;
    const loop = () => {
      const video = videoRef.current;
      const cv = sampleCanvasRef.current;
      if (!video || video.readyState < 2 || !cv) { rafRef.current = requestAnimationFrame(loop); return; }
      const ctx = cv.getContext("2d", { willReadFrequently: true })!;
      const W = video.videoWidth, H = video.videoHeight;
      cv.width = W; cv.height = H;
      ctx.drawImage(video, 0, 0);
      const R = 24;
      const cx = Math.floor(W / 2), cy = Math.floor(H / 2);
      const imgData = ctx.getImageData(cx - R, cy - R, R * 2, R * 2).data;
      let r = 0, g = 0, b = 0;
      for (let i = 0; i < imgData.length; i += 4) { r += imgData[i]; g += imgData[i + 1]; b += imgData[i + 2]; }
      const n = imgData.length / 4;
      const sr = r / n, sg = g / n, sb = b / n;
      setScanned({ r: sr, g: sg, b: sb });
      const ranked = threadColors
        .map(tc => ({ ...tc, dist: colorDist(sr, sg, sb, tc.r, tc.g, tc.b) }))
        .sort((a, b) => a.dist - b.dist)
        .slice(0, 5);
      setMatches(ranked);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [cameraOn, frozen, threadColors]);

  /* ── Cleanup on unmount ── */
  useEffect(() => () => { stopCamera(); }, [stopCamera]);

  const BASE = import.meta.env.BASE_URL;

  return (
    <div style={{ minHeight: "100vh", background: "#0f172a", fontFamily: "'Segoe UI', system-ui, sans-serif", color: "white" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderBottom: "1px solid #1e293b" }}>
        <a href={`${BASE}`} style={{ textDecoration: "none" }}>
          <button style={{ border: "1px solid #334155", background: "#1e293b", color: "#94a3b8", borderRadius: 10, padding: "7px 12px", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>← Quay lại</button>
        </a>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: "white" }}>📷 Quét màu vải</div>
          <div style={{ fontSize: 11, color: "#64748b" }}>Gingko Brand · So màu với {threadColors.length} mã chỉ</div>
        </div>
      </div>

      {/* Camera viewport */}
      <div style={{ position: "relative", width: "100%", maxWidth: 480, margin: "0 auto", background: "#000" }}>
        <video
          ref={videoRef}
          playsInline muted
          style={{ width: "100%", display: "block", aspectRatio: "4/3", objectFit: "cover" }}
        />
        <canvas ref={sampleCanvasRef} style={{ display: "none" }} />

        {/* Crosshair overlay */}
        {cameraOn && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
            {/* Darkened corners */}
            <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.35)" }} />
            {/* Clear center circle */}
            <div style={{
              position: "relative", zIndex: 1,
              width: 80, height: 80, borderRadius: "50%",
              border: "3px solid white",
              boxShadow: "0 0 0 3000px rgba(0,0,0,0.35), 0 0 20px rgba(255,255,255,0.3)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {scanned && (
                <div style={{
                  width: 56, height: 56, borderRadius: "50%",
                  background: toHex(scanned.r, scanned.g, scanned.b),
                  border: "2px solid rgba(255,255,255,0.5)",
                }} />
              )}
            </div>
            {/* Corner marks */}
            {[[-1,-1],[1,-1],[-1,1],[1,1]].map(([dx,dy],i) => (
              <div key={i} style={{
                position: "absolute",
                left: `calc(50% + ${dx * 44}px - 8px)`,
                top: `calc(50% + ${dy * 44}px - 8px)`,
                width: 16, height: 16,
                borderTop: dy < 0 ? "2px solid white" : "none",
                borderBottom: dy > 0 ? "2px solid white" : "none",
                borderLeft: dx < 0 ? "2px solid white" : "none",
                borderRight: dx > 0 ? "2px solid white" : "none",
                zIndex: 2,
              }} />
            ))}
            <div style={{ position: "absolute", bottom: 16, left: 0, right: 0, textAlign: "center", zIndex: 2 }}>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", background: "rgba(0,0,0,0.4)", borderRadius: 8, padding: "3px 10px" }}>
                {frozen ? "Đã chụp · bấm ▶ để tiếp tục" : "Hướng camera vào vải · bấm ⏸ để chốt"}
              </span>
            </div>
          </div>
        )}

        {/* Camera off state */}
        {!cameraOn && (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#0f172a", gap: 16, aspectRatio: "4/3" }}>
            <div style={{ fontSize: 48 }}>📷</div>
            <div style={{ fontSize: 14, color: "#94a3b8", textAlign: "center", padding: "0 32px" }}>
              {loading ? "Đang tải dữ liệu màu chỉ..." : "Bấm nút bên dưới để bật camera"}
            </div>
            {cameraError && <div style={{ fontSize: 12, color: "#f87171", textAlign: "center", padding: "0 24px" }}>⚠️ {cameraError}</div>}
          </div>
        )}
      </div>

      {/* Controls */}
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "14px 16px", display: "flex", gap: 10, justifyContent: "center" }}>
        {!cameraOn ? (
          <button
            onClick={startCamera}
            disabled={loading}
            style={{
              flex: 1, padding: "14px", border: "none", borderRadius: 14,
              background: loading ? "#334155" : "linear-gradient(135deg,#059669,#065f46)",
              color: loading ? "#64748b" : "white",
              fontWeight: 800, fontSize: 16, cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Đang tải..." : "📷 Bật camera"}
          </button>
        ) : (
          <>
            <button
              onClick={() => setFrozen(f => !f)}
              style={{
                flex: 1, padding: "14px", border: "none", borderRadius: 14,
                background: frozen ? "linear-gradient(135deg,#059669,#065f46)" : "#1e293b",
                color: "white", fontWeight: 800, fontSize: 16, cursor: "pointer",
                border: "1.5px solid #334155",
              } as React.CSSProperties}
            >
              {frozen ? "▶ Tiếp tục" : "⏸ Chốt màu"}
            </button>
            <button
              onClick={stopCamera}
              style={{
                padding: "14px 18px", border: "1.5px solid #334155", borderRadius: 14,
                background: "#1e293b", color: "#94a3b8", fontWeight: 700, fontSize: 15, cursor: "pointer",
              }}
            >■ Tắt</button>
          </>
        )}
      </div>

      {/* Scanned color display */}
      {scanned && (
        <div style={{ maxWidth: 480, margin: "0 auto 12px", padding: "0 16px" }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 12,
            background: "#1e293b", borderRadius: 14, padding: "12px 16px",
            border: "1px solid #334155",
          }}>
            <div style={{ width: 48, height: 48, borderRadius: 10, background: toHex(scanned.r, scanned.g, scanned.b), flexShrink: 0, border: "2px solid #475569" }} />
            <div>
              <div style={{ fontSize: 13, color: "#64748b", marginBottom: 2 }}>Màu đang quét</div>
              <div style={{ fontSize: 16, fontWeight: 800, fontFamily: "monospace", color: "white" }}>{toHex(scanned.r, scanned.g, scanned.b).toUpperCase()}</div>
              <div style={{ fontSize: 11, color: "#64748b" }}>R:{Math.round(scanned.r)} G:{Math.round(scanned.g)} B:{Math.round(scanned.b)}</div>
            </div>
          </div>
        </div>
      )}

      {/* Matches */}
      {matches.length > 0 && (
        <div style={{ maxWidth: 480, margin: "0 auto", padding: "0 16px 32px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>
            Top {matches.length} mã chỉ gần nhất
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {matches.map((m, i) => {
              const pct = similarity(m.dist);
              const isTop = i === 0;
              return (
                <div key={m.code} style={{
                  display: "flex", alignItems: "center", gap: 12,
                  background: isTop ? "#1e3a5f" : "#1e293b",
                  borderRadius: 14, padding: "12px 14px",
                  border: `1.5px solid ${isTop ? "#3b82f6" : "#334155"}`,
                  transition: "all 0.2s",
                }}>
                  {/* Rank */}
                  <div style={{
                    width: 24, height: 24, borderRadius: "50%", flexShrink: 0,
                    background: isTop ? "#3b82f6" : "#334155",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 800, color: isTop ? "white" : "#64748b",
                  }}>{i + 1}</div>

                  {/* Thread color swatch */}
                  <div style={{
                    width: 44, height: 44, borderRadius: 10, flexShrink: 0,
                    background: toHex(m.r, m.g, m.b),
                    border: "2px solid #475569",
                  }} />

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 800, fontFamily: "monospace", color: "white" }}>{m.code}</div>
                    <div style={{ fontSize: 11, color: "#64748b" }}>Cột {m.col} · {toHex(m.r, m.g, m.b).toUpperCase()}</div>
                    {/* Similarity bar */}
                    <div style={{ marginTop: 6, height: 4, background: "#334155", borderRadius: 2, overflow: "hidden" }}>
                      <div style={{
                        height: "100%", borderRadius: 2,
                        width: `${pct}%`,
                        background: pct >= 80 ? "#22c55e" : pct >= 60 ? "#eab308" : "#f97316",
                        transition: "width 0.15s",
                      }} />
                    </div>
                  </div>

                  {/* Pct */}
                  <div style={{
                    fontSize: 15, fontWeight: 800,
                    color: pct >= 80 ? "#22c55e" : pct >= 60 ? "#eab308" : "#f97316",
                    flexShrink: 0,
                  }}>{pct}%</div>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 12, fontSize: 11, color: "#475569", textAlign: "center" }}>
            * Màu sắc phụ thuộc vào ánh sáng và màn hình hiển thị
          </div>
        </div>
      )}
    </div>
  );
}
