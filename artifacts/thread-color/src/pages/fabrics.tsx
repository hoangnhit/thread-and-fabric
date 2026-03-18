import { useState, useRef, useEffect } from "react";

interface FabricItem {
  id: string;
  name: string;
  image: string; // base64 or data URL
}

const STORAGE_KEY = "gingko-fabric-catalog";

/* ─── PRESET SOLID COLORS ────────────────────────────────────────── */
const PRESET_COLORS = [
  { name: "White",            hex: "#FFFFFF" },
  { name: "Black",            hex: "#1C1C1C" },
  { name: "Navy",             hex: "#1B2A4A" },
  { name: "Blue Blue (Classic Blue)", hex: "#0F4C81" },
  { name: "Powder Blue",      hex: "#AECFDF" },
  { name: "Omphalodes",       hex: "#9BC4E2" },
  { name: "Aqua",             hex: "#3CBFB4" },
  { name: "Biscay Green",     hex: "#4A7B5E" },
  { name: "Evergreen",        hex: "#014421" },
  { name: "True Red",         hex: "#CC2200" },
  { name: "Fandango Pink",    hex: "#E63C6E" },
  { name: "Orchid Pink",      hex: "#DF80AD" },
  { name: "Anemone",          hex: "#7B3FA8" },
  { name: "Purple",           hex: "#6B21A8" },
  { name: "Perfectly Lale",   hex: "#B89EC8" },
  { name: "Pastel Lilac Sachet", hex: "#DDD0EA" },
  { name: "Desert Flower",    hex: "#FF7F6E" },
  { name: "Easter Yellow",    hex: "#F9E68C" },
  { name: "Antarctica",       hex: "#E8EDF0" },
  { name: "White Clover",     hex: "#F5F5F0" },
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

function loadFabrics(): FabricItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveFabrics(items: FabricItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export default function Fabrics() {
  const [fabrics, setFabrics] = useState<FabricItem[]>(loadFabrics);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newImage, setNewImage] = useState<string | null>(null);
  const [newImageFileName, setNewImageFileName] = useState("");
  const [search, setSearch] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => { saveFabrics(fabrics); }, [fabrics]);

  const handleFileSelect = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    setNewImageFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => setNewImage(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleAdd = () => {
    if (!newName.trim() || !newImage) return;
    const item: FabricItem = {
      id: Date.now().toString(),
      name: newName.trim(),
      image: newImage,
    };
    setFabrics(prev => [item, ...prev]);
    setNewName("");
    setNewImage(null);
    setNewImageFileName("");
    setShowAdd(false);
  };

  const handleAddPresets = () => {
    const existing = new Set(fabrics.map(f => f.name.toLowerCase()));
    const toAdd: FabricItem[] = PRESET_COLORS
      .filter(p => !existing.has(p.name.toLowerCase()))
      .map((p, i) => ({
        id: `preset-${Date.now()}-${i}`,
        name: p.name,
        image: colorToDataUrl(p.hex, p.name),
      }));
    if (toAdd.length === 0) return;
    setFabrics(prev => [...prev, ...toAdd]);
  };

  const handleDelete = (id: string) => {
    setFabrics(prev => prev.filter(f => f.id !== id));
    setDeleteId(null);
  };

  const handleEdit = (id: string) => {
    if (!editName.trim()) return;
    setFabrics(prev => prev.map(f => f.id === id ? { ...f, name: editName.trim() } : f));
    setEditId(null);
    setEditName("");
  };

  const filtered = search.trim()
    ? fabrics.filter(f => f.name.toLowerCase().includes(search.toLowerCase()))
    : fabrics;

  const pill = (active: boolean) => ({
    padding: "7px 18px", borderRadius: 20, border: "none", cursor: "pointer",
    fontSize: 13, fontWeight: 700,
    background: active ? "#059669" : "#f1f5f9",
    color: active ? "white" : "#64748b",
    transition: "all 0.18s",
  });

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", fontFamily: "'Segoe UI', system-ui, sans-serif" }}>

      {/* Header */}
      <div style={{
        background: "linear-gradient(160deg, #064e3b 0%, #065f46 40%, #059669 100%)",
        padding: "28px 20px 48px", position: "relative", overflow: "hidden",
      }}>
        <div style={{ position: "absolute", top: -40, right: -40, width: 180, height: 180, borderRadius: "50%", background: "rgba(255,255,255,0.04)" }} />
        <div style={{ maxWidth: 640, margin: "0 auto", position: "relative", zIndex: 1, textAlign: "center" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.12)", borderRadius: 20, padding: "4px 14px", marginBottom: 14, fontSize: 11, color: "rgba(255,255,255,0.85)", letterSpacing: "0.1em", fontWeight: 700 }}>
            🧵 GINGKO BRAND
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

          {/* Nav + search row */}
          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
            <a href={import.meta.env.BASE_URL} style={{ textDecoration: "none" }}>
              <button style={pill(false)}>🔍 Tra chỉ thêu</button>
            </a>
            <button style={pill(true)}>🎨 Danh mục vải</button>
            <div style={{ flex: 1, minWidth: 120 }}>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Tìm tên vải..."
                style={{
                  width: "100%", border: "1.5px solid #e5e7eb", borderRadius: 10,
                  padding: "7px 12px", fontSize: 13, outline: "none",
                  fontFamily: "inherit", boxSizing: "border-box",
                }}
              />
            </div>
            <button
              onClick={handleAddPresets}
              title="Thêm 20 màu cơ bản (White, Black, Blue, Red...)"
              style={{
                background: "#f59e0b", color: "white", border: "none", borderRadius: 10,
                padding: "8px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              🎨 Màu cơ bản
            </button>
            <button
              onClick={() => setShowAdd(true)}
              style={{
                background: "#059669", color: "white", border: "none", borderRadius: 10,
                padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer",
                display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
              }}
            >
              + Thêm vải
            </button>
          </div>

          {/* Add modal */}
          {showAdd && (
            <div style={{
              position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 200,
              display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
            }}
              onClick={e => { if (e.target === e.currentTarget) { setShowAdd(false); setNewImage(null); setNewName(""); setNewImageFileName(""); } }}
            >
              <div style={{ background: "white", borderRadius: 20, padding: 24, width: "100%", maxWidth: 380, boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}>
                <h3 style={{ margin: "0 0 18px", fontSize: 17, fontWeight: 800, color: "#111" }}>➕ Thêm mẫu vải</h3>

                {/* Drop zone */}
                <div
                  ref={dropRef}
                  onDragOver={e => { e.preventDefault(); (dropRef.current!).style.borderColor = "#059669"; }}
                  onDragLeave={() => (dropRef.current!).style.borderColor = "#d1fae5"}
                  onDrop={e => { e.preventDefault(); (dropRef.current!).style.borderColor = "#d1fae5"; const f = e.dataTransfer.files[0]; if (f) handleFileSelect(f); }}
                  onClick={() => fileRef.current?.click()}
                  style={{
                    border: "2px dashed #d1fae5", borderRadius: 14, padding: "20px 16px",
                    textAlign: "center", cursor: "pointer", background: "#f0fdf4",
                    marginBottom: 14, transition: "border-color 0.2s", minHeight: 120,
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8,
                  }}
                >
                  {newImage ? (
                    <>
                      <img src={newImage} alt="preview" style={{ maxHeight: 100, maxWidth: "100%", borderRadius: 10, objectFit: "cover" }} />
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
                    onClick={() => { setShowAdd(false); setNewImage(null); setNewName(""); setNewImageFileName(""); }}
                    style={{ flex: 1, padding: "10px", border: "1.5px solid #e5e7eb", borderRadius: 10, background: "white", cursor: "pointer", fontSize: 14, fontWeight: 600, color: "#6b7280" }}
                  >Huỷ</button>
                  <button
                    onClick={handleAdd}
                    disabled={!newName.trim() || !newImage}
                    style={{
                      flex: 2, padding: "10px", border: "none", borderRadius: 10, cursor: (!newName.trim() || !newImage) ? "not-allowed" : "pointer",
                      fontSize: 14, fontWeight: 700, color: "white",
                      background: (!newName.trim() || !newImage) ? "#9ca3af" : "#059669",
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
      <main style={{ maxWidth: 640, margin: "20px auto 40px", padding: "0 16px" }}>
        {filtered.length === 0 && (
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
          {filtered.map(f => (
            <div key={f.id} style={{
              background: "white", borderRadius: 16,
              boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
              overflow: "hidden", position: "relative",
            }}>
              {/* Swatch image */}
              <div style={{ width: "100%", aspectRatio: "4/3", overflow: "hidden", background: "#f1f5f9" }}>
                <img src={f.image} alt={f.name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
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
          ))}
        </div>
      </main>

      <div style={{ textAlign: "center", padding: "20px 16px", borderTop: "1px solid #e5e7eb", background: "white", fontSize: 12, color: "#9ca3af" }}>
        Gingko Brand High-Grade Embroidery Thread · 100% Polyester
      </div>
    </div>
  );
}
