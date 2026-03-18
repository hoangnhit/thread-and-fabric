import { useState, useRef, useEffect, useCallback } from "react";

const API = "/api";

interface FabricItem { id: number; name: string; image: string; }
interface FabricColor { id: number; name: string; image: string; r: number; g: number; b: number; }
type Match = FabricColor & { dist: number; pct: number };

/* ─── color helpers ─── */
function colorDist(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number) {
  const dr = r1 - r2, dg = g1 - g2, db = b1 - b2;
  return Math.sqrt(2 * dr * dr + 4 * dg * dg + 3 * db * db);
}
function toHex(r: number, g: number, b: number) {
  return "#" + [r, g, b].map(v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("");
}
function distToPct(dist: number) { return Math.max(0, Math.round(100 - dist / 4.5)); }

/* Extract average color from an image src over its center 60% region */
async function extractColorFromSrc(src: string, useProxy = false): Promise<{ r: number; g: number; b: number } | null> {
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = useProxy && src.startsWith("http")
      ? `${API}/proxy-image?url=${encodeURIComponent(src)}`
      : src;
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(); });
    const SIZE = 120;
    const cv = document.createElement("canvas");
    cv.width = SIZE; cv.height = SIZE;
    const ctx = cv.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0, SIZE, SIZE);
    // sample center 60% of the image
    const pad = Math.floor(SIZE * 0.2);
    const d = ctx.getImageData(pad, pad, SIZE - pad * 2, SIZE - pad * 2).data;
    let r = 0, g = 0, b = 0, count = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 128) continue;
      r += d[i]; g += d[i + 1]; b += d[i + 2]; count++;
    }
    if (!count) return null;
    return { r: r / count, g: g / count, b: b / count };
  } catch { return null; }
}

/* Sample average color from a canvas region, filtering out shadow/reflection pixels */
function sampleCanvasArea(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  halfW: number, halfH: number
): { r: number; g: number; b: number } {
  const d = ctx.getImageData(cx - halfW, cy - halfH, halfW * 2, halfH * 2).data;
  let r = 0, g = 0, b = 0, count = 0;
  for (let i = 0; i < d.length; i += 4) {
    const pr = d[i], pg = d[i + 1], pb = d[i + 2];
    const brightness = (pr + pg + pb) / 3;
    if (brightness > 245) continue; // skip only pure specular white (blown-out highlights)
    r += pr; g += pg; b += pb; count++;
  }
  if (count === 0) {
    // fallback: use all pixels if filtering removed everything
    let fr = 0, fg = 0, fb = 0;
    const n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) { fr += d[i]; fg += d[i + 1]; fb += d[i + 2]; }
    return { r: fr / n, g: fg / n, b: fb / n };
  }
  return { r: r / count, g: g / count, b: b / count };
}

export default function ColorScan() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [fabricColors, setFabricColors] = useState<FabricColor[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadMsg, setLoadMsg] = useState("Đang tải danh mục vải...");

  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [countdown, setCountdown] = useState<number | null>(null);

  // captured state
  const [capturedDataUrl, setCapturedDataUrl] = useState<string | null>(null);
  const [capturedColor, setCapturedColor] = useState<{ r: number; g: number; b: number } | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [analyzing, setAnalyzing] = useState(false);

  /* ── Load fabrics and extract their colors ── */
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`${API}/fabrics`);
        const fabrics: FabricItem[] = await res.json();
        if (!fabrics.length) {
          setLoadMsg("Chưa có mẫu vải — hãy thêm vải trước");
          setLoading(false);
          return;
        }
        setLoadMsg(`Đang phân tích ${fabrics.length} mẫu vải...`);
        const result: FabricColor[] = [];
        for (const f of fabrics) {
          if (cancelled) return;
          const color = await extractColorFromSrc(f.image, true);
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
    setCapturedDataUrl(null);
    setCapturedColor(null);
    setMatches([]);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
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
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  }, []);

  /* ── Perform actual capture after countdown ── */
  const doCapture = useCallback(() => {
    const video = videoRef.current;
    const cv = captureCanvasRef.current;
    if (!video || !cv || video.readyState < 2) return;

    const W = video.videoWidth, H = video.videoHeight;
    cv.width = W; cv.height = H;
    const ctx = cv.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(video, 0, 0);

    // sample wide center region (center 50% width × 50% height), skip shadow/reflection pixels
    const hw = Math.floor(W * 0.25), hh = Math.floor(H * 0.25);
    const sampled = sampleCanvasArea(ctx, Math.floor(W / 2), Math.floor(H / 2), hw, hh);
    setCapturedColor(sampled);

    const dataUrl = cv.toDataURL("image/jpeg", 0.9);
    setCapturedDataUrl(dataUrl);

    const ranked = fabricColors
      .map(fc => ({ ...fc, dist: colorDist(sampled.r, sampled.g, sampled.b, fc.r, fc.g, fc.b), pct: 0 }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 5)
      .map(m => ({ ...m, pct: distToPct(m.dist) }));
    setMatches(ranked);

    stopCamera();
  }, [fabricColors, stopCamera]);

  /* ── Start 2-second countdown, then capture ── */
  const startCountdown = useCallback(() => {
    if (countdown !== null) return;
    let n = 2;
    setCountdown(n);
    const iv = setInterval(() => {
      n -= 1;
      if (n <= 0) {
        clearInterval(iv);
        setCountdown(null);
        doCapture();
      } else {
        setCountdown(n);
      }
    }, 1000);
  }, [countdown, doCapture]);

  useEffect(() => () => { stopCamera(); }, [stopCamera]);

  const BASE = import.meta.env.BASE_URL;

  /* ── UI ── */
  return (
    <div style={{ minHeight: "100vh", background: "#0f172a", fontFamily: "'Segoe UI', system-ui, sans-serif", color: "white" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderBottom: "1px solid #1e293b" }}>
        <a href={`${BASE}`} style={{ textDecoration: "none" }}>
          <button style={{ border: "1px solid #334155", background: "#1e293b", color: "#94a3b8", borderRadius: 10, padding: "7px 12px", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>← Quay lại</button>
        </a>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800 }}>📷 Quét màu vải</div>
          <div style={{ fontSize: 11, color: "#64748b" }}>{loadMsg}</div>
        </div>
      </div>

      {/* ── Camera / Preview area ── */}
      <div style={{ position: "relative", width: "100%", maxWidth: 480, margin: "0 auto", background: "#000" }}>

        {/* Live camera feed */}
        <video
          ref={videoRef}
          playsInline muted
          style={{ width: "100%", display: cameraOn ? "block" : "none", aspectRatio: "4/3", objectFit: "cover" }}
        />
        <canvas ref={captureCanvasRef} style={{ display: "none" }} />

        {/* Sampling zone overlay shown while camera is on */}
        {cameraOn && (
          <div style={{ position: "absolute", inset: 0, pointerEvents: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {/* dim outside the zone */}
            <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.35)" }} />
            {/* the wide sampling rectangle */}
            <div style={{
              position: "relative", zIndex: 1,
              width: "54%", aspectRatio: "1",
              border: "2.5px solid white",
              borderRadius: 12,
              boxShadow: "0 0 0 3000px rgba(0,0,0,0.35)",
            }}>
              {/* corner accents */}
              {([["0","0",""],["auto","0",""],["0","auto",""],["auto","auto",""]] as [string,string,string][]).map(([b,r,_],i) => (
                <div key={i} style={{
                  position: "absolute",
                  top: i < 2 ? -3 : "auto", bottom: i >= 2 ? -3 : "auto",
                  left: i % 2 === 0 ? -3 : "auto", right: i % 2 === 1 ? -3 : "auto",
                  width: 18, height: 18,
                  borderTop: i < 2 ? "3px solid #38bdf8" : "none",
                  borderBottom: i >= 2 ? "3px solid #38bdf8" : "none",
                  borderLeft: i % 2 === 0 ? "3px solid #38bdf8" : "none",
                  borderRight: i % 2 === 1 ? "3px solid #38bdf8" : "none",
                }} />
              ))}
            </div>
            {/* Countdown big number */}
            {countdown !== null && (
              <div style={{ position: "absolute", zIndex: 3, display: "flex", alignItems: "center", justifyContent: "center", inset: 0 }}>
                <div style={{ fontSize: 96, fontWeight: 900, color: "white", textShadow: "0 0 30px rgba(0,0,0,0.8)", lineHeight: 1 }}>
                  {countdown}
                </div>
              </div>
            )}
            <div style={{ position: "absolute", bottom: 14, left: 0, right: 0, textAlign: "center", zIndex: 2 }}>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.85)", background: "rgba(0,0,0,0.5)", borderRadius: 8, padding: "4px 12px" }}>
                {countdown !== null ? "Camera đang căn sáng..." : "Đặt vải vào khung · bấm 📸 để chụp"}
              </span>
            </div>
          </div>
        )}

        {/* Captured photo */}
        {capturedDataUrl && !cameraOn && (
          <div style={{ position: "relative" }}>
            <img src={capturedDataUrl} alt="captured" style={{ width: "100%", display: "block", aspectRatio: "4/3", objectFit: "cover" }} />
            {/* show sampling zone on captured photo */}
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
              <div style={{ width: "54%", aspectRatio: "1", border: "2.5px solid white", borderRadius: 12, opacity: 0.7 }} />
            </div>
            {/* color chip overlay */}
            {capturedColor && (
              <div style={{
                position: "absolute", top: 10, right: 10,
                background: "rgba(15,23,42,0.8)", borderRadius: 10, padding: "8px 10px",
                display: "flex", alignItems: "center", gap: 8, backdropFilter: "blur(6px)",
              }}>
                <div style={{ width: 28, height: 28, borderRadius: 6, background: toHex(capturedColor.r, capturedColor.g, capturedColor.b), border: "2px solid rgba(255,255,255,0.4)" }} />
                <div>
                  <div style={{ fontSize: 11, color: "#94a3b8" }}>Màu phân tích</div>
                  <div style={{ fontSize: 13, fontWeight: 700, fontFamily: "monospace" }}>{toHex(capturedColor.r, capturedColor.g, capturedColor.b).toUpperCase()}</div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Idle / off state */}
        {!cameraOn && !capturedDataUrl && (
          <div style={{ aspectRatio: "4/3", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: "0 32px" }}>
            <div style={{ fontSize: 56 }}>📷</div>
            <div style={{ fontSize: 14, color: "#94a3b8", textAlign: "center" }}>
              {loading ? loadMsg : fabricColors.length === 0 ? "Chưa có mẫu vải trong danh mục" : "Bật camera, đặt vải vào khung, rồi chụp để phân tích màu"}
            </div>
            {cameraError && <div style={{ fontSize: 12, color: "#f87171", textAlign: "center" }}>⚠️ {cameraError}</div>}
          </div>
        )}
      </div>

      {/* ── Controls ── */}
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "14px 16px", display: "flex", gap: 10 }}>
        {!cameraOn ? (
          <>
            <button
              onClick={startCamera}
              disabled={loading || fabricColors.length === 0}
              style={{
                flex: 1, padding: 14, border: "none", borderRadius: 14,
                fontWeight: 800, fontSize: 16,
                cursor: (loading || !fabricColors.length) ? "not-allowed" : "pointer",
                background: (loading || !fabricColors.length) ? "#334155" : "linear-gradient(135deg,#059669,#065f46)",
                color: (loading || !fabricColors.length) ? "#64748b" : "white",
              }}>
              {loading ? "Đang tải..." : fabricColors.length === 0 ? "Chưa có mẫu vải" : capturedDataUrl ? "📷 Chụp lại" : "📷 Bật camera"}
            </button>
            {capturedDataUrl && (
              <button onClick={() => { setCapturedDataUrl(null); setCapturedColor(null); setMatches([]); }}
                style={{ padding: "14px 16px", border: "1.5px solid #334155", borderRadius: 14, background: "#1e293b", color: "#94a3b8", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                Xoá
              </button>
            )}
          </>
        ) : (
          <>
            {/* Shutter button */}
            <button
              onClick={startCountdown}
              disabled={countdown !== null}
              style={{
                flex: 1, padding: 16, border: "none", borderRadius: 14,
                background: countdown !== null ? "#94a3b8" : "white",
                color: "#0f172a",
                fontWeight: 900, fontSize: 18,
                cursor: countdown !== null ? "not-allowed" : "pointer",
                boxShadow: "0 0 0 4px rgba(255,255,255,0.2)",
                letterSpacing: "0.02em",
              } as React.CSSProperties}>
              {countdown !== null ? `⏱ Chờ ${countdown}s...` : "📸 Chụp & Phân tích"}
            </button>
            <button onClick={stopCamera}
              style={{ padding: "14px 16px", border: "1.5px solid #334155", borderRadius: 14, background: "#1e293b", color: "#94a3b8", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
              Huỷ
            </button>
          </>
        )}
      </div>

      {/* ── Results ── */}
      {analyzing && (
        <div style={{ maxWidth: 480, margin: "0 auto", padding: "0 16px", textAlign: "center", color: "#64748b", fontSize: 14 }}>Đang phân tích...</div>
      )}

      {matches.length > 0 && !analyzing && (
        <div style={{ maxWidth: 480, margin: "0 auto", padding: "0 16px 36px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>
            Mẫu vải tương đồng nhất
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {matches.map((m, i) => {
              const isTop = i === 0;
              const barColor = m.pct >= 80 ? "#22c55e" : m.pct >= 55 ? "#eab308" : "#f97316";
              return (
                <div key={m.id} style={{
                  display: "flex", alignItems: "center", gap: 12,
                  background: isTop ? "#1e3a5f" : "#1e293b",
                  borderRadius: 14, padding: "12px 14px",
                  border: `1.5px solid ${isTop ? "#3b82f6" : "#334155"}`,
                }}>
                  <div style={{ width: 24, height: 24, borderRadius: "50%", flexShrink: 0, background: isTop ? "#3b82f6" : "#334155", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: isTop ? "white" : "#64748b" }}>{i + 1}</div>
                  <img src={m.image} alt={m.name} style={{ width: 52, height: 52, borderRadius: 10, objectFit: "cover", flexShrink: 0, border: "2px solid #475569" }} />
                  <div style={{ width: 26, height: 26, borderRadius: "50%", background: toHex(m.r, m.g, m.b), flexShrink: 0, border: "2px solid #475569" }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.name}</div>
                    <div style={{ marginTop: 5, height: 4, background: "#334155", borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ height: "100%", borderRadius: 2, width: `${m.pct}%`, background: barColor }} />
                    </div>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: barColor, flexShrink: 0 }}>{m.pct}%</div>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 12, fontSize: 11, color: "#475569", textAlign: "center" }}>
            * Ánh sáng ảnh hưởng đến độ chính xác · quét dưới đèn trắng tốt hơn
          </div>
        </div>
      )}
    </div>
  );
}
