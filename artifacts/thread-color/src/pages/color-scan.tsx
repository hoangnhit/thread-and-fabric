import { useState, useRef, useEffect, useCallback } from "react";

const API = "/api";

interface FabricItem { id: number; name: string; image: string; }
interface FabricColor { id: number; name: string; image: string; r: number; g: number; b: number; }
type Match = FabricColor & { dist: number; pct: number };

/* ─── helpers ─── */
function colorDist(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number) {
  const dr = r1 - r2, dg = g1 - g2, db = b1 - b2;
  return Math.sqrt(2 * dr * dr + 4 * dg * dg + 3 * db * db);
}
function toHex(r: number, g: number, b: number) {
  return "#" + [r, g, b].map(v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("");
}
function distToPct(dist: number) {
  return Math.max(0, Math.round(100 - dist / 4.5));
}

/* Extract dominant color from base64/url image using canvas */
async function extractColor(src: string): Promise<{ r: number; g: number; b: number } | null> {
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    const proxied = src.startsWith("http") ? `${API}/proxy-image?url=${encodeURIComponent(src)}` : src;
    img.src = proxied;
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(); });
    const SIZE = 80;
    const cv = document.createElement("canvas");
    cv.width = SIZE; cv.height = SIZE;
    const ctx = cv.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0, SIZE, SIZE);
    const d = ctx.getImageData(0, 0, SIZE, SIZE).data;
    let r = 0, g = 0, b = 0, count = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 128) continue;
      r += d[i]; g += d[i + 1]; b += d[i + 2]; count++;
    }
    if (!count) return null;
    return { r: r / count, g: g / count, b: b / count };
  } catch { return null; }
}

export default function ColorScan() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const sampleCanvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);

  const [fabricColors, setFabricColors] = useState<FabricColor[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadMsg, setLoadMsg] = useState("Đang tải danh mục vải...");

  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [scanned, setScanned] = useState<{ r: number; g: number; b: number } | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [frozen, setFrozen] = useState(false);

  /* ── Load fabrics and extract colors ── */
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`${API}/fabrics`);
        const fabrics: FabricItem[] = await res.json();
        if (!fabrics.length) {
          setLoadMsg("Danh mục vải trống — hãy thêm vải trước");
          setLoading(false);
          return;
        }
        setLoadMsg(`Đang phân tích màu ${fabrics.length} mẫu vải...`);
        const result: FabricColor[] = [];
        for (const f of fabrics) {
          if (cancelled) return;
          const color = await extractColor(f.image);
          if (color) result.push({ ...f, ...color });
        }
        if (!cancelled) {
          setFabricColors(result);
          setLoadMsg(`Sẵn sàng · ${result.length} mẫu vải`);
          setLoading(false);
        }
      } catch {
        if (!cancelled) { setLoadMsg("Lỗi tải dữ liệu"); setLoading(false); }
      }
    }
    load();
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

  /* ── Real-time sample loop ── */
  useEffect(() => {
    if (!cameraOn || frozen || !fabricColors.length) return;
    const loop = () => {
      const video = videoRef.current;
      const cv = sampleCanvasRef.current;
      if (!video || video.readyState < 2 || !cv) { rafRef.current = requestAnimationFrame(loop); return; }
      const ctx = cv.getContext("2d", { willReadFrequently: true })!;
      const W = video.videoWidth, H = video.videoHeight;
      cv.width = W; cv.height = H;
      ctx.drawImage(video, 0, 0);
      const R = 28;
      const cx = Math.floor(W / 2), cy = Math.floor(H / 2);
      const d = ctx.getImageData(cx - R, cy - R, R * 2, R * 2).data;
      let r = 0, g = 0, b = 0;
      for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
      const n = d.length / 4;
      const sr = r / n, sg = g / n, sb = b / n;
      setScanned({ r: sr, g: sg, b: sb });
      const ranked = fabricColors
        .map(fc => {
          const dist = colorDist(sr, sg, sb, fc.r, fc.g, fc.b);
          return { ...fc, dist, pct: distToPct(dist) };
        })
        .sort((a, b) => a.dist - b.dist)
        .slice(0, 5);
      setMatches(ranked);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [cameraOn, frozen, fabricColors]);

  useEffect(() => () => { stopCamera(); }, [stopCamera]);

  const BASE = import.meta.env.BASE_URL;

  return (
    <div style={{ minHeight: "100vh", background: "#0f172a", fontFamily: "'Segoe UI', system-ui, sans-serif", color: "white" }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderBottom: "1px solid #1e293b" }}>
        <a href={`${BASE}`} style={{ textDecoration: "none" }}>
          <button style={{ border: "1px solid #334155", background: "#1e293b", color: "#94a3b8", borderRadius: 10, padding: "7px 12px", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>← Quay lại</button>
        </a>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800 }}>📷 Quét màu vải</div>
          <div style={{ fontSize: 11, color: "#64748b" }}>{loadMsg}</div>
        </div>
      </div>

      {/* ── Camera viewport ── */}
      <div style={{ position: "relative", width: "100%", maxWidth: 480, margin: "0 auto", background: "#000" }}>
        <video ref={videoRef} playsInline muted
          style={{ width: "100%", display: "block", aspectRatio: "4/3", objectFit: "cover" }} />
        <canvas ref={sampleCanvasRef} style={{ display: "none" }} />

        {cameraOn && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
            <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.38)" }} />
            {/* Aim circle */}
            <div style={{
              position: "relative", zIndex: 1,
              width: 84, height: 84, borderRadius: "50%",
              border: "3px solid white",
              boxShadow: "0 0 0 3000px rgba(0,0,0,0.38), 0 0 18px rgba(255,255,255,0.25)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {scanned && (
                <div style={{ width: 60, height: 60, borderRadius: "50%", background: toHex(scanned.r, scanned.g, scanned.b), border: "2px solid rgba(255,255,255,0.45)" }} />
              )}
            </div>
            {/* Corner marks */}
            {([[-1,-1],[1,-1],[-1,1],[1,1]] as [number,number][]).map(([dx,dy],i) => (
              <div key={i} style={{
                position: "absolute",
                left: `calc(50% + ${dx * 46}px - 8px)`,
                top: `calc(50% + ${dy * 46}px - 8px)`,
                width: 16, height: 16,
                borderTop: dy < 0 ? "2px solid white" : "none",
                borderBottom: dy > 0 ? "2px solid white" : "none",
                borderLeft: dx < 0 ? "2px solid white" : "none",
                borderRight: dx > 0 ? "2px solid white" : "none",
                zIndex: 2,
              }} />
            ))}
            <div style={{ position: "absolute", bottom: 14, left: 0, right: 0, textAlign: "center", zIndex: 2 }}>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.75)", background: "rgba(0,0,0,0.45)", borderRadius: 8, padding: "3px 10px" }}>
                {frozen ? "Đã chốt · bấm ▶ để tiếp tục" : "Hướng vải vào vòng tròn · bấm ⏸ để chốt"}
              </span>
            </div>
          </div>
        )}

        {!cameraOn && (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#0f172a", gap: 14, aspectRatio: "4/3" }}>
            <div style={{ fontSize: 52 }}>📷</div>
            <div style={{ fontSize: 14, color: "#94a3b8", textAlign: "center", padding: "0 32px" }}>
              {loading ? loadMsg : fabricColors.length === 0 ? "Chưa có mẫu vải nào trong danh mục" : "Bật camera để quét màu vải"}
            </div>
            {cameraError && <div style={{ fontSize: 12, color: "#f87171", textAlign: "center", padding: "0 24px" }}>⚠️ {cameraError}</div>}
          </div>
        )}
      </div>

      {/* ── Controls ── */}
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "14px 16px", display: "flex", gap: 10 }}>
        {!cameraOn ? (
          <button onClick={startCamera} disabled={loading || fabricColors.length === 0}
            style={{ flex: 1, padding: 14, border: "none", borderRadius: 14, fontWeight: 800, fontSize: 16, cursor: (loading || !fabricColors.length) ? "not-allowed" : "pointer", background: (loading || !fabricColors.length) ? "#334155" : "linear-gradient(135deg,#059669,#065f46)", color: (loading || !fabricColors.length) ? "#64748b" : "white" }}>
            {loading ? "Đang tải..." : fabricColors.length === 0 ? "Chưa có mẫu vải" : "📷 Bật camera"}
          </button>
        ) : (
          <>
            <button onClick={() => setFrozen(f => !f)}
              style={{ flex: 1, padding: 14, border: `1.5px solid ${frozen ? "#059669" : "#334155"}`, borderRadius: 14, background: frozen ? "linear-gradient(135deg,#059669,#065f46)" : "#1e293b", color: "white", fontWeight: 800, fontSize: 16, cursor: "pointer" } as React.CSSProperties}>
              {frozen ? "▶ Tiếp tục" : "⏸ Chốt màu"}
            </button>
            <button onClick={stopCamera}
              style={{ padding: "14px 18px", border: "1.5px solid #334155", borderRadius: 14, background: "#1e293b", color: "#94a3b8", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>
              ■ Tắt
            </button>
          </>
        )}
      </div>

      {/* ── Scanned color chip ── */}
      {scanned && (
        <div style={{ maxWidth: 480, margin: "0 auto 12px", padding: "0 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, background: "#1e293b", borderRadius: 14, padding: "12px 16px", border: "1px solid #334155" }}>
            <div style={{ width: 48, height: 48, borderRadius: 10, background: toHex(scanned.r, scanned.g, scanned.b), flexShrink: 0, border: "2px solid #475569" }} />
            <div>
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 2 }}>Màu đang quét</div>
              <div style={{ fontSize: 17, fontWeight: 800, fontFamily: "monospace" }}>{toHex(scanned.r, scanned.g, scanned.b).toUpperCase()}</div>
              <div style={{ fontSize: 11, color: "#64748b" }}>R:{Math.round(scanned.r)} G:{Math.round(scanned.g)} B:{Math.round(scanned.b)}</div>
            </div>
          </div>
        </div>
      )}

      {/* ── Match results ── */}
      {matches.length > 0 && (
        <div style={{ maxWidth: 480, margin: "0 auto", padding: "0 16px 36px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>
            Mẫu vải tương đồng nhất
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {matches.map((m, i) => {
              const isTop = i === 0;
              const barColor = m.pct >= 80 ? "#22c55e" : m.pct >= 55 ? "#eab308" : "#f97316";
              return (
                <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 12, background: isTop ? "#1e3a5f" : "#1e293b", borderRadius: 14, padding: "12px 14px", border: `1.5px solid ${isTop ? "#3b82f6" : "#334155"}` }}>
                  {/* rank */}
                  <div style={{ width: 24, height: 24, borderRadius: "50%", flexShrink: 0, background: isTop ? "#3b82f6" : "#334155", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: isTop ? "white" : "#64748b" }}>{i + 1}</div>
                  {/* fabric thumbnail */}
                  <img src={m.image} alt={m.name} style={{ width: 52, height: 52, borderRadius: 10, objectFit: "cover", flexShrink: 0, border: "2px solid #475569" }} />
                  {/* extracted color dot */}
                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: toHex(m.r, m.g, m.b), flexShrink: 0, border: "2px solid #475569" }} />
                  {/* info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "white", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.name}</div>
                    <div style={{ marginTop: 5, height: 4, background: "#334155", borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ height: "100%", borderRadius: 2, width: `${m.pct}%`, background: barColor, transition: "width 0.15s" }} />
                    </div>
                  </div>
                  {/* pct */}
                  <div style={{ fontSize: 15, fontWeight: 800, color: barColor, flexShrink: 0 }}>{m.pct}%</div>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 12, fontSize: 11, color: "#475569", textAlign: "center" }}>
            * Kết quả phụ thuộc vào ánh sáng · quét dưới đèn trắng để chính xác hơn
          </div>
        </div>
      )}

      {/* Empty state when camera is on but no fabrics matched */}
      {cameraOn && !scanned && (
        <div style={{ maxWidth: 480, margin: "20px auto", padding: "0 16px", textAlign: "center", color: "#475569", fontSize: 13 }}>
          Đang chờ tín hiệu camera...
        </div>
      )}
    </div>
  );
}
