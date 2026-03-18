import { createContext, useContext, useEffect, useState, ReactNode } from "react";

interface ThemeCtx {
  isDark: boolean;
  toggle: () => void;
}

const Ctx = createContext<ThemeCtx>({ isDark: false, toggle: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [isDark, setIsDark] = useState(() => {
    try { return localStorage.getItem("theme") === "dark"; } catch { return false; }
  });

  useEffect(() => {
    localStorage.setItem("theme", isDark ? "dark" : "light");
    document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
  }, [isDark]);

  return (
    <Ctx.Provider value={{ isDark, toggle: () => setIsDark(p => !p) }}>
      {children}
    </Ctx.Provider>
  );
}

export const useTheme = () => useContext(Ctx);

export function mkTheme(isDark: boolean) {
  return isDark ? {
    bg:        "#0f172a",
    card:      "#1e293b",
    cardInner: "#0f172a",
    border:    "#334155",
    text:      "#f1f5f9",
    text2:     "#94a3b8",
    muted:     "#64748b",
    seg:       "#0f172a",
    segActive: "#1e293b",
    inputBg:   "#0f172a",
    inputBorder: "#334155",
    sectionBg: "#0f172a",
    resultCard:"#1e293b",
    resultCardBorder: "#334155",
    scrolledNavBg: "#0f172a",
  } : {
    bg:        "#f8fafc",
    card:      "white",
    cardInner: "white",
    border:    "#e5e7eb",
    text:      "#111827",
    text2:     "#6b7280",
    muted:     "#9ca3af",
    seg:       "#f1f5f9",
    segActive: "white",
    inputBg:   "white",
    inputBorder: "#e5e7eb",
    sectionBg: "#f8fafc",
    resultCard:"white",
    resultCardBorder: "#e5e7eb",
    scrolledNavBg: "#f8fafc",
  };
}
