import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";

interface FabricItem {
  id: number;
  name: string;
  image: string;
}

const API = "/api";

/* ─── PRESET SOLID COLORS ────────────────────────────────────────── */
const PRESET_COLORS = [
  { name: "White",                    hex: "#F8F6F2" },
  { name: "Black",                    hex: "#0D0D0D" },
  { name: "Navy",                     hex: "#132246" },
  { name: "Blue Blue (Classic Blue)", hex: "#0F4C81" },
  { name: "Powder Blue",              hex: "#97C4D8" },
  { name: "Omphalodes",               hex: "#6FA8C8" },
  { name: "Aqua",                     hex: "#008C8C" },
  { name: "Biscay Green",             hex: "#2E6B50" },
  { name: "Evergreen",                hex: "#0D3B27" },
  { name: "True Red",                 hex: "#C0151F" },
  { name: "Fandango Pink",            hex: "#D63065" },
  { name: "Orchid Pink",              hex: "#D4789A" },
  { name: "Anemone",                  hex: "#6E2B8C" },
  { name: "Purple",                   hex: "#5A1A8A" },
  { name: "Perfectly Lale",           hex: "#9A7CB8" },
  { name: "Pastel Lilac Sachet",      hex: "#CDBFDC" },
  { name: "Desert Flower",            hex: "#E07060" },
  { name: "Easter Yellow",            hex: "#F2D55A" },
  { name: "Antarctica",               hex: "#D8E2E8" },
  { name: "White Clover",             hex: "#ECEDE0" },
];

function colorToDataUrl(hex: string, name: string): string {
  const isDark = (() => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 < 128;
  })();
  const textColor = isDark ? "#ffffff" : "#374151";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240">
    <rect width="320" height="240" fill="${hex}" stroke="${isDark ? "none" : "#d1d5db"}" stroke-width="1"/>
    <text x="160" y="130" font-family="system-ui,sans-serif" font-size="18" font-weight="700"
      fill="${textColor}" text-anchor="middle" opacity="0.55">${name}</text>
  </svg>`;
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
}

export default function Fabrics() {
  const [, navigate] = useLocation();
  const [fabrics, setFabrics] = useState<FabricItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [addTab, setAddTab] = useState<"photo" | "color">("color");
  const [newName, setNewName] = useState("");
  const [newImage, setNewImage] = useState<string | null>(null);
  const [newImageFileName, setNewImageFileName] = useState("");
  const [pickerHex, setPickerHex] = useState("#4A90D9");
  const [urlInput, setUrlInput] = useState("");
  const [urlError, setUrlError] = useState("");
  const [search, setSearch] = useState("");
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [zoomItem, setZoomItem] = useState<FabricItem | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [compareIds, setCompareIds] = useState<number[]>([]);
  const [showCompare, setShowCompare] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const fetchFabrics = async () => {
    try {
      const res = await fetch(`${API}/fabrics`);
      const data: FabricItem[] = await res.json();
      setFabrics(data);

      if (data.length === 0) {
        const OLD_KEY = "gingko-fabric-catalog";
        const raw = localStorage.getItem(OLD_KEY);
        if (raw) {
          const old: { id: string; name: string; image: string }[] = JSON.parse(raw);
          if (old.length > 0) {
            await Promise.all(old.map(item =>
              fetch(`${API}/fabrics`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: item.name, image: item.image }),
              })
            ));
            localStorage.removeItem(OLD_KEY);
            const res2 = await fetch(`${API}/fabrics`);
            setFabrics(await res2.json());
          }
        }
      }
    } catch (e) {
      console.error("Failed to load fabrics", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchFabrics(); }, []);

  const handleFileSelect = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    setNewImageFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => setNewImage(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  const resetAddForm = () => {
    setNewName("");
    setNewImage(null);
    setNewImageFileName("");
    setPickerHex("#4A90D9");
    setUrlInput("");
    setUrlError("");
    setAddTab("color");
    setShowAdd(false);
  };

  const handleApplyUrl = () => {
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    try {
      new URL(trimmed);
    } catch {
      setUrlError("Link không hợp lệ. VD: https://example.com/image.jpg");
      return;
    }
    setUrlError("");
    setNewImage(trimmed);
    setNewImageFileName("link ảnh");
  };

  const handleAdd = async () => {
    const resolvedImage = addTab === "color"
      ? colorToDataUrl(pickerHex, newName.trim() || pickerHex)
      : newImage;
    if (!newName.trim() || !resolvedImage) return;
    try {
      const res = await fetch(`${API}/fabrics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), image: resolvedImage }),
      });
      const item: FabricItem = await res.json();
      setFabrics(prev => [...prev, item]);
    } catch (e) { console.error(e); }
    resetAddForm();
  };

  const handleAddPresets = async () => {
    const existing = new Set(fabrics.map(f => f.name.toLowerCase()));
    const toAdd = PRESET_COLORS.filter(p => !existing.has(p.name.toLowerCase()));
    if (toAdd.length === 0) return;
    const results = await Promise.all(toAdd.map(p =>
      fetch(`${API}/fabrics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: p.name, image: colorToDataUrl(p.hex, p.name) }),
      }).then(r => r.json())
    ));
    setFabrics(prev => [...prev, ...results]);
  };

  const handleDelete = async (id: number) => {
    try {
      await fetch(`${API}/fabrics/${id}`, { method: "DELETE" });
      setFabrics(prev => prev.filter(f => f.id !== id));
    } catch (e) { console.error(e); }
    setDeleteId(null);
  };

  const handleEdit = async (id: number) => {
    if (!editName.trim()) return;
    try {
      const res = await fetch(`${API}/fabrics/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim() }),
      });
      const updated: FabricItem = await res.json();
      setFabrics(prev => prev.map(f => f.id === id ? updated : f));
    } catch (e) { console.error(e); }
    setEditId(null);
    setEditName("");
  };

  const toggleCompare = (id: number) => {
    setCompareIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
  };

  const exitCompareMode = () => {
    setCompareMode(false);
    setCompareIds([]);
    setShowCompare(false);
  };

  const compareItems = fabrics.filter(f => compareIds.includes(f.id));

  const filtered = search.trim()
    ? fabrics.filter(f => f.name.toLowerCase().includes(search.toLowerCase()))
    : fabrics;

  const mainTab = (active: boolean, color: string) => ({
    flex: 1, padding: "9px 10px", border: "none",
    borderBottom: active ? `2.5px solid ${color}` : "2.5px solid transparent",
    marginBottom: -1, cursor: "pointer",
    fontSize: 13, fontWeight: active ? 700 : 500,
    color: active ? color : "#9ca3af",
    background: "transparent", transition: "all 0.15s",
    whiteSpace: "nowrap" as const,
  });

  const subPill = (active: boolean, color = "#059669") => ({
    padding: "5px 14px", borderRadius: 20, cursor: "pointer",
    fontSize: 12, fontWeight: 600,
    border: `1.5px solid ${active ? color : "#e5e7eb"}`,
    background: active ? color : "white",
    color: active ? "white" : "#6b7280",
    transition: "all 0.15s", whiteSpace: "nowrap" as const,
  });

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", fontFamily: "'Segoe UI', system-ui, sans-serif" }}>

      {/* Header */}
      <div style={{
        backgroundImage: "url(https://i.pinimg.com/736x/7b/ff/14/7bff148d3a7ce0c7d9efabd332745075.jpg)",
        backgroundSize: "cover", backgroundPosition: "center",
        padding: "28px 20px 48px", position: "relative", overflow: "hidden",
      }}>
        <div style={{ position: "absolute", inset: 0, background: "rgba(4,20,12,0.62)", zIndex: 0 }} />
        <div style={{ position: "absolute", top: -40, right: -40, width: 180, height: 180, borderRadius: "50%", background: "rgba(255,255,255,0.04)", zIndex: 0 }} />
        <div style={{ maxWidth: 640, margin: "0 auto", position: "relative", zIndex: 1, textAlign: "center" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "rgba(255,255,255,0.12)", borderRadius: 20, padding: "4px 14px", marginBottom: 14, fontSize: 11, color: "rgba(255,255,255,0.85)", letterSpacing: "0.1em", fontWeight: 700 }}>
            <img src={`${import.meta.env.BASE_URL}thienduc-logo.png`} alt="logo" style={{ width: 18, height: 18, objectFit: "contain", borderRadius: 3 }} />
            THIÊN ĐỨC HATS
          </div>
          <h1 style={{ margin: "0 0 6px", fontSize: 26, fontWeight: 800, color: "white", letterSpacing: "-0.02em" }}>
            Danh Mục Vải
          </h1>
          <p style={{ margin: 0, fontSize: 13, color: "rgba(255,255,255,0.65)" }}>
            Lưu ảnh mẫu vải và tên màu · {fabrics.length} loại
          </p>
        </div>
      </div>

      {/* Nav links */}
      <div style={{ maxWidth: 640, margin: "-28px auto 0", padding: "0 16px", position: "relative", zIndex: 10 }}>
        <div style={{ background: "white", borderRadius: 20, padding: 20, boxShadow: "0 8px 40px rgba(0,0,0,0.13)" }}>

          {/* Tier 1 — main nav tabs */}
          <div style={{ display: "flex", borderBottom: "1px solid #e5e7eb", marginBottom: 14 }}>
            <button onClick={() => navigate("/")} style={mainTab(false, "#059669")}>
              🧵 Danh mục màu chỉ
            </button>
            <button style={mainTab(true, "#d97706")}>
              🎨 Danh mục vải
            </button>
            <button onClick={() => navigate("/viewer")} style={mainTab(false, "#6d28d9")}>
              📁 File thêu
            </button>
          </div>

          {/* Tier 2 — fabric sub-actions */}
          <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ flex: 1, minWidth: 120 }}>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="🔍 Tìm tên vải..."
                style={{
                  width: "100%", border: "1.5px solid #e5e7eb", borderRadius: 20,
                  padding: "5px 14px", fontSize: 12, outline: "none",
                  fontFamily: "inherit", boxSizing: "border-box", color: "#374151",
                }}
              />
            </div>
            <button onClick={() => { setCompareMode(m => !m); setCompareIds([]); setShowCompare(false); }}
              style={subPill(compareMode, "#0ea5e9")}>
              ↔️ So sánh
            </button>
            <button onClick={handleAddPresets}
              title="Thêm 20 màu cơ bản (White, Black, Blue, Red...)"
              style={subPill(false, "#f59e0b")}>
              🎨 Màu cơ bản
            </button>
            <button onClick={() => setShowAdd(true)}
              style={{ ...subPill(false, "#059669"), background: "#059669", color: "white", border: "1.5px solid #059669" }}>
              + Thêm vải
            </button>
          </div>

          {/* Add modal */}
          {showAdd && (
            <div style={{
              position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 200,
              display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
            }}
              onClick={e => { if (e.target === e.currentTarget) resetAddForm(); }}
            >
              <div style={{ background: "white", borderRadius: 20, padding: 24, width: "100%", maxWidth: 380, boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}>
                <h3 style={{ margin: "0 0 14px", fontSize: 17, fontWeight: 800, color: "#111" }}>➕ Thêm mẫu vải</h3>

                {/* Tab switcher */}
                <div style={{ display: "flex", background: "#f3f4f6", borderRadius: 10, padding: 3, marginBottom: 16 }}>
                  {(["color", "photo"] as const).map(t => (
                    <button key={t} onClick={() => setAddTab(t)} style={{
                      flex: 1, padding: "7px", border: "none", borderRadius: 8, cursor: "pointer",
                      fontWeight: 700, fontSize: 13,
                      background: addTab === t ? "white" : "transparent",
                      color: addTab === t ? "#059669" : "#6b7280",
                      boxShadow: addTab === t ? "0 1px 4px rgba(0,0,0,0.1)" : "none",
                      transition: "all 0.15s",
                    }}>
                      {t === "color" ? "🎨 Chọn màu" : "📷 Upload ảnh"}
                    </button>
                  ))}
                </div>

                {/* Color picker tab */}
                {addTab === "color" && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{
                      borderRadius: 12, height: 110, marginBottom: 10,
                      background: pickerHex,
                      border: "1.5px solid #e5e7eb",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <span style={{
                        fontSize: 13, fontWeight: 700, padding: "4px 10px",
                        borderRadius: 6, background: "rgba(255,255,255,0.55)",
                        color: "#374151",
                      }}>{pickerHex.toUpperCase()}</span>
                    </div>
                    <input
                      type="color"
                      value={pickerHex}
                      onChange={e => setPickerHex(e.target.value)}
                      style={{
                        width: "100%", height: 42, border: "1.5px solid #e5e7eb",
                        borderRadius: 10, cursor: "pointer", padding: 2,
                      }}
                    />
                  </div>
                )}

                {/* Photo upload tab */}
                {addTab === "photo" && (
                  <>
                    <div
                      ref={dropRef}
                      onDragOver={e => { e.preventDefault(); dropRef.current!.style.borderColor = "#059669"; }}
                      onDragLeave={() => { dropRef.current!.style.borderColor = "#d1fae5"; }}
                      onDrop={e => { e.preventDefault(); dropRef.current!.style.borderColor = "#d1fae5"; const f = e.dataTransfer.files[0]; if (f) handleFileSelect(f); }}
                      onClick={() => fileRef.current?.click()}
                      style={{
                        border: "2px dashed #d1fae5", borderRadius: 14, padding: "20px 16px",
                        textAlign: "center", cursor: "pointer", background: "#f0fdf4",
                        marginBottom: 14, transition: "border-color 0.2s", minHeight: 110,
                        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8,
                      }}
                    >
                      {newImage ? (
                        <>
                          <img src={newImage} alt="preview" style={{ maxHeight: 90, maxWidth: "100%", borderRadius: 10, objectFit: "cover" }} />
                          <div style={{ fontSize: 11, color: "#6b7280" }}>{newImageFileName}</div>
                        </>
                      ) : (
                        <>
                          <div style={{ fontSize: 32 }}>📷</div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "#059669" }}>Bấm hoặc kéo ảnh vào đây</div>
                          <div style={{ fontSize: 11, color: "#9ca3af" }}>JPG, PNG, WEBP</div>
                        </>
                      )}
                    </div>
                    <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); e.target.value = ""; }} />

                    {/* URL input */}
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", marginBottom: 6 }}>
                        🔗 Hoặc dán link ảnh
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <input
                          value={urlInput}
                          onChange={e => { setUrlInput(e.target.value); setUrlError(""); }}
                          onKeyDown={e => e.key === "Enter" && handleApplyUrl()}
                          placeholder="https://example.com/anh-vai.jpg"
                          style={{
                            flex: 1, border: `1.5px solid ${urlError ? "#ef4444" : "#e5e7eb"}`,
                            borderRadius: 8, padding: "8px 10px", fontSize: 12,
                            outline: "none", fontFamily: "inherit", minWidth: 0,
                          }}
                        />
                        <button
                          onClick={handleApplyUrl}
                          style={{
                            padding: "8px 12px", background: "#0f4c81", color: "white",
                            border: "none", borderRadius: 8, cursor: "pointer",
                            fontSize: 12, fontWeight: 700, whiteSpace: "nowrap",
                          }}
                        >Dùng</button>
                      </div>
                      {urlError && <div style={{ fontSize: 11, color: "#ef4444", marginTop: 4 }}>{urlError}</div>}
                    </div>
                  </>
                )}

                {/* Name input */}
                <input
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleAdd()}
                  placeholder="Tên màu vải (VD: Powder Blue, True Red...)"
                  style={{
                    width: "100%", border: "1.5px solid #e5e7eb", borderRadius: 10,
                    padding: "10px 12px", fontSize: 14, outline: "none",
                    fontFamily: "inherit", boxSizing: "border-box", marginBottom: 16,
                  }}
                  autoFocus
                />

                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    onClick={resetAddForm}
                    style={{ flex: 1, padding: "10px", border: "1.5px solid #e5e7eb", borderRadius: 10, background: "white", cursor: "pointer", fontSize: 14, fontWeight: 600, color: "#6b7280" }}
                  >Huỷ</button>
                  <button
                    onClick={handleAdd}
                    disabled={!newName.trim() || (addTab === "photo" && !newImage)}
                    style={{
                      flex: 2, padding: "10px", border: "none", borderRadius: 10,
                      cursor: (!newName.trim() || (addTab === "photo" && !newImage)) ? "not-allowed" : "pointer",
                      fontSize: 14, fontWeight: 700, color: "white",
                      background: (!newName.trim() || (addTab === "photo" && !newImage)) ? "#9ca3af" : "#059669",
                      transition: "background 0.15s",
                    }}
                  >✅ Lưu</button>
                </div>
              </div>
            </div>
          )}

          {/* Delete confirm */}
          {deleteId && (
            <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
              <div style={{ background: "white", borderRadius: 16, padding: 24, maxWidth: 300, textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}>
                <div style={{ fontSize: 32, marginBottom: 10 }}>🗑️</div>
                <p style={{ margin: "0 0 18px", fontSize: 14, color: "#374151" }}>Xoá mẫu vải này khỏi danh sách?</p>
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={() => setDeleteId(null)} style={{ flex: 1, padding: "9px", border: "1.5px solid #e5e7eb", borderRadius: 10, background: "white", cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#6b7280" }}>Huỷ</button>
                  <button onClick={() => handleDelete(deleteId)} style={{ flex: 1, padding: "9px", border: "none", borderRadius: 10, background: "#dc2626", cursor: "pointer", fontSize: 13, fontWeight: 700, color: "white" }}>Xoá</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Fabric grid */}
      <main style={{ maxWidth: 640, margin: "20px auto 0", padding: `0 16px ${compareMode ? "100px" : "40px"}` }}>
        {loading && (
          <div style={{ textAlign: "center", padding: "48px 20px", color: "#9ca3af" }}>
            <div style={{ fontSize: 32, marginBottom: 10, animation: "spin 1s linear infinite" }}>⏳</div>
            <div style={{ fontSize: 14 }}>Đang tải danh mục vải...</div>
          </div>
        )}
        {!loading && filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: "48px 20px", color: "#9ca3af" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🎨</div>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6, color: "#6b7280" }}>
              {search ? "Không tìm thấy vải phù hợp" : "Chưa có mẫu vải nào"}
            </div>
            <div style={{ fontSize: 13 }}>
              {search ? "Thử tìm tên khác" : "Bấm \"+ Thêm vải\" để bắt đầu"}
            </div>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
          {filtered.map(f => {
            const isSelected = compareIds.includes(f.id);
            const selIdx = compareIds.indexOf(f.id);
            return (
            <div key={f.id} style={{
              background: "white", borderRadius: 16,
              boxShadow: isSelected
                ? `0 0 0 3px ${selIdx === 0 ? "#0ea5e9" : "#f59e0b"}, 0 2px 12px rgba(0,0,0,0.08)`
                : "0 2px 12px rgba(0,0,0,0.08)",
              overflow: "hidden", position: "relative",
              transition: "box-shadow 0.15s",
            }}>
              {/* Swatch image */}
              <div
                onClick={() => compareMode ? toggleCompare(f.id) : setZoomItem(f)}
                style={{ width: "100%", aspectRatio: "4/3", overflow: "hidden", background: "#f1f5f9", cursor: compareMode ? "pointer" : "zoom-in", position: "relative" }}
              >
                <img src={f.image} alt={f.name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />

                {/* Normal mode: zoom hint */}
                {!compareMode && (
                  <div style={{
                    position: "absolute", bottom: 6, right: 6,
                    background: "rgba(0,0,0,0.35)", borderRadius: 6,
                    padding: "2px 6px", fontSize: 11, color: "white", fontWeight: 600,
                    backdropFilter: "blur(4px)",
                  }}>🔍</div>
                )}

                {/* Compare mode: selection overlay */}
                {compareMode && (
                  <div style={{
                    position: "absolute", inset: 0,
                    background: isSelected ? "rgba(0,0,0,0.18)" : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "background 0.15s",
                  }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: "50%",
                      border: `3px solid ${isSelected ? (selIdx === 0 ? "#0ea5e9" : "#f59e0b") : "rgba(255,255,255,0.8)"}`,
                      background: isSelected ? (selIdx === 0 ? "#0ea5e9" : "#f59e0b") : "rgba(255,255,255,0.4)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 16, color: "white", fontWeight: 900,
                      boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
                    }}>
                      {isSelected ? (selIdx === 0 ? "1" : "2") : ""}
                    </div>
                  </div>
                )}
              </div>

              {/* Name */}
              <div style={{ padding: "10px 12px 12px" }}>
                {editId === f.id ? (
                  <div style={{ display: "flex", gap: 6 }}>
                    <input
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") handleEdit(f.id); if (e.key === "Escape") setEditId(null); }}
                      autoFocus
                      style={{ flex: 1, border: "1.5px solid #059669", borderRadius: 8, padding: "5px 8px", fontSize: 13, outline: "none", fontFamily: "inherit" }}
                    />
                    <button onClick={() => handleEdit(f.id)} style={{ border: "none", background: "#059669", color: "white", borderRadius: 8, padding: "0 10px", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>✓</button>
                    <button onClick={() => setEditId(null)} style={{ border: "1px solid #e5e7eb", background: "white", borderRadius: 8, padding: "0 8px", cursor: "pointer", fontSize: 13, color: "#6b7280" }}>✕</button>
                  </div>
                ) : (
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#1e293b", lineHeight: 1.4, marginBottom: 8, wordBreak: "break-word" }}>
                    {f.name}
                  </div>
                )}

                {editId !== f.id && (
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      onClick={() => { setEditId(f.id); setEditName(f.name); }}
                      style={{ flex: 1, border: "1px solid #e5e7eb", background: "#f8fafc", borderRadius: 8, padding: "5px 0", cursor: "pointer", fontSize: 12, color: "#6b7280", fontWeight: 600 }}
                    >✏️ Sửa tên</button>
                    <button
                      onClick={() => setDeleteId(f.id)}
                      style={{ border: "1px solid #fecaca", background: "#fff5f5", borderRadius: 8, padding: "5px 10px", cursor: "pointer", fontSize: 12, color: "#dc2626" }}
                    >🗑️</button>
                  </div>
                )}
              </div>
            </div>
          );
          })}
        </div>
      </main>


      {/* ── ZOOM LIGHTBOX ── */}
      {zoomItem && (
        <div
          onClick={() => setZoomItem(null)}
          style={{
            position: "fixed", inset: 0, zIndex: 999,
            background: "rgba(0,0,0,0.88)",
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            padding: 16, cursor: "zoom-out",
          }}
        >
          {/* Close hint */}
          <div style={{
            position: "absolute", top: 16, right: 16,
            background: "rgba(255,255,255,0.15)", borderRadius: 8,
            padding: "6px 12px", fontSize: 13, color: "white", fontWeight: 600,
          }}>✕ Đóng</div>

          {/* Large image */}
          <img
            src={zoomItem.image}
            alt={zoomItem.name}
            onClick={e => e.stopPropagation()}
            style={{
              maxWidth: "100%", maxHeight: "80vh",
              borderRadius: 16,
              boxShadow: "0 8px 48px rgba(0,0,0,0.6)",
              objectFit: "contain",
            }}
          />

          {/* Name label */}
          <div style={{
            marginTop: 18, fontSize: 17, fontWeight: 800,
            color: "white", textAlign: "center",
            textShadow: "0 2px 8px rgba(0,0,0,0.5)",
          }}>{zoomItem.name}</div>

          {/* Action buttons */}
          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <button
              onClick={e => { e.stopPropagation(); setEditId(zoomItem.id); setEditName(zoomItem.name); setZoomItem(null); }}
              style={{
                padding: "8px 18px", borderRadius: 10, border: "none",
                background: "rgba(255,255,255,0.18)", color: "white",
                fontSize: 13, fontWeight: 700, cursor: "pointer",
              }}
            >✏️ Sửa tên</button>
            <button
              onClick={e => { e.stopPropagation(); setDeleteId(zoomItem.id); setZoomItem(null); }}
              style={{
                padding: "8px 18px", borderRadius: 10, border: "none",
                background: "rgba(220,38,38,0.65)", color: "white",
                fontSize: 13, fontWeight: 700, cursor: "pointer",
              }}
            >🗑️ Xoá</button>
          </div>
        </div>
      )}

      {/* ── FLOATING COMPARE BAR ── */}
      {compareMode && (
        <div style={{
          position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 500,
          background: "white", borderTop: "2px solid #e0f2fe",
          padding: "12px 20px", display: "flex", alignItems: "center",
          gap: 10, boxShadow: "0 -4px 24px rgba(0,0,0,0.1)",
        }}>
          {/* Slot indicators */}
          <div style={{ display: "flex", gap: 8, flex: 1, alignItems: "center" }}>
            {[0, 1].map(idx => {
              const item = compareItems[idx];
              return (
                <div key={idx} style={{
                  display: "flex", alignItems: "center", gap: 6,
                  background: item ? (idx === 0 ? "#e0f2fe" : "#fef3c7") : "#f3f4f6",
                  borderRadius: 10, padding: "6px 10px", minWidth: 90,
                  border: `2px solid ${item ? (idx === 0 ? "#0ea5e9" : "#f59e0b") : "#e5e7eb"}`,
                }}>
                  {item ? (
                    <>
                      <div style={{
                        width: 28, height: 28, borderRadius: 6, overflow: "hidden", flexShrink: 0,
                        boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
                      }}>
                        <img src={item.image} alt={item.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#1e293b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 80 }}>
                        {item.name}
                      </span>
                      <button onClick={() => toggleCompare(item.id)} style={{ marginLeft: "auto", border: "none", background: "none", cursor: "pointer", fontSize: 14, color: "#6b7280", padding: 0, lineHeight: 1 }}>✕</button>
                    </>
                  ) : (
                    <span style={{ fontSize: 12, color: "#9ca3af", fontWeight: 600 }}>
                      {idx + 1}. Chọn vải...
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          <button
            onClick={() => setShowCompare(true)}
            disabled={compareIds.length < 2}
            style={{
              padding: "10px 18px", border: "none", borderRadius: 10,
              background: compareIds.length === 2 ? "#0ea5e9" : "#e5e7eb",
              color: compareIds.length === 2 ? "white" : "#9ca3af",
              fontWeight: 800, fontSize: 13, cursor: compareIds.length === 2 ? "pointer" : "not-allowed",
              transition: "all 0.18s", whiteSpace: "nowrap",
            }}
          >↔️ So sánh ngay</button>
          <button
            onClick={exitCompareMode}
            style={{
              padding: "10px 12px", border: "1.5px solid #e5e7eb", borderRadius: 10,
              background: "white", color: "#6b7280", fontWeight: 700, fontSize: 12,
              cursor: "pointer",
            }}
          >Thoát</button>
        </div>
      )}

      {/* ── COMPARE MODAL ── */}
      {showCompare && compareItems.length === 2 && (
        <div
          onClick={() => setShowCompare(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 1000,
            background: "rgba(0,0,0,0.85)",
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            padding: "16px 24px",
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: "white", borderRadius: 20, overflow: "hidden",
              width: "100%", maxWidth: 760,
              boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
            }}
          >
            {/* Header */}
            <div style={{
              background: "linear-gradient(135deg, #0ea5e9, #f59e0b)",
              padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <span style={{ color: "white", fontWeight: 800, fontSize: 15 }}>↔️ So sánh màu vải</span>
              <button onClick={() => setShowCompare(false)} style={{ border: "none", background: "rgba(255,255,255,0.2)", borderRadius: 6, padding: "4px 10px", color: "white", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>✕</button>
            </div>

            {/* Side-by-side swatches */}
            <div style={{ display: "flex", gap: 0, position: "relative" }}>
              {compareItems.map((item, idx) => (
                <div key={item.id} style={{ flex: 1, position: "relative" }}>
                  <div style={{ aspectRatio: "1/1", overflow: "hidden" }}>
                    <img src={item.image} alt={item.name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  </div>
                  <div style={{
                    padding: "14px 16px", borderTop: `3px solid ${idx === 0 ? "#0ea5e9" : "#f59e0b"}`,
                    background: idx === 0 ? "#f0f9ff" : "#fffbeb",
                  }}>
                    <div style={{
                      display: "inline-block", fontSize: 10, fontWeight: 800, letterSpacing: "0.05em",
                      background: idx === 0 ? "#0ea5e9" : "#f59e0b", color: "white",
                      borderRadius: 4, padding: "2px 7px", marginBottom: 6,
                    }}>{idx === 0 ? "VẢI 1" : "VẢI 2"}</div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: "#1e293b", lineHeight: 1.4 }}>
                      {item.name}
                    </div>
                  </div>
                </div>
              ))}

              {/* VS divider */}
              <div style={{
                position: "absolute", left: "50%", top: "calc(50% - 50px)",
                transform: "translate(-50%, -50%)",
                width: 36, height: 36, borderRadius: "50%",
                background: "white", border: "3px solid #e5e7eb",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 900, color: "#374151",
                boxShadow: "0 2px 8px rgba(0,0,0,0.15)", zIndex: 5,
                pointerEvents: "none",
              }}>VS</div>
            </div>

            {/* Swap button */}
            <div style={{ padding: "14px 20px", borderTop: "1px solid #e5e7eb", display: "flex", gap: 10, justifyContent: "center" }}>
              <button
                onClick={() => setCompareIds(prev => [prev[1], prev[0]])}
                style={{
                  padding: "8px 18px", border: "1.5px solid #e5e7eb", borderRadius: 10,
                  background: "white", color: "#374151", fontWeight: 700, fontSize: 13, cursor: "pointer",
                }}
              >🔄 Đổi vị trí</button>
              <button
                onClick={() => { setShowCompare(false); setCompareIds([]); }}
                style={{
                  padding: "8px 18px", border: "none", borderRadius: 10,
                  background: "#f1f5f9", color: "#374151", fontWeight: 700, fontSize: 13, cursor: "pointer",
                }}
              >Chọn lại</button>
            </div>
          </div>
        </div>
      )}

      {/* ── FLOATING CONTACT ── */}
      <div style={{ position: "fixed", bottom: 20, left: 16, zIndex: 100, display: "flex", flexDirection: "column", gap: 10 }}>
        <a href="https://zalo.me/0969896403" target="_blank" rel="noopener noreferrer"
          title="Liên hệ Zalo"
          style={{ width: 48, height: 48, borderRadius: 14, background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none", transition: "transform 0.18s", filter: "drop-shadow(0 4px 10px rgba(0,104,255,0.5))" }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "scale(1.12)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = "scale(1)"; }}
        >
          <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/9/91/Icon_of_Zalo.svg/960px-Icon_of_Zalo.svg.png" alt="Zalo" style={{ width: 48, height: 48, borderRadius: 14, objectFit: "cover" }} />
        </a>
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
      <div style={{ textAlign: "center", padding: "20px 16px 28px", color: "#94a3b8", fontSize: 11, letterSpacing: "0.08em", fontWeight: 500 }}>
        DESIGNED by NGUYEN HUU HOANG
      </div>
    </div>
  );
}
