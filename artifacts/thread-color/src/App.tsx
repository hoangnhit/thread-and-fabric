import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider, useTheme } from "@/contexts/ThemeContext";
import Home from "@/pages/home";
import Fabrics from "@/pages/fabrics";
import Viewer from "@/pages/viewer";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

function SunIcon() {
  return (
    <svg width="38" height="38" viewBox="0 0 38 38" fill="none">
      <circle cx="19" cy="19" r="18" stroke="#f5c42e" strokeWidth="1.6"/>
      <circle cx="19" cy="19" r="6.5" fill="#f5c42e"/>
      <line x1="19" y1="4"  x2="19" y2="9"  stroke="#f5c42e" strokeWidth="1.8" strokeLinecap="round"/>
      <line x1="19" y1="29" x2="19" y2="34" stroke="#f5c42e" strokeWidth="1.8" strokeLinecap="round"/>
      <line x1="4"  y1="19" x2="9"  y2="19" stroke="#f5c42e" strokeWidth="1.8" strokeLinecap="round"/>
      <line x1="29" y1="19" x2="34" y2="19" stroke="#f5c42e" strokeWidth="1.8" strokeLinecap="round"/>
      <line x1="7.8"  y1="7.8"  x2="11.4" y2="11.4" stroke="#f5c42e" strokeWidth="1.8" strokeLinecap="round"/>
      <line x1="26.6" y1="26.6" x2="30.2" y2="30.2" stroke="#f5c42e" strokeWidth="1.8" strokeLinecap="round"/>
      <line x1="30.2" y1="7.8"  x2="26.6" y2="11.4" stroke="#f5c42e" strokeWidth="1.8" strokeLinecap="round"/>
      <line x1="11.4" y1="26.6" x2="7.8"  y2="30.2" stroke="#f5c42e" strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="38" height="38" viewBox="0 0 38 38" fill="none">
      <circle cx="19" cy="19" r="18" stroke="#3d4f6b" strokeWidth="1.6"/>
      <path d="M21 10C16.6 10 13 13.6 13 18C13 22.4 16.6 26 21 26C23.2 26 25.2 25.1 26.7 23.6C25.2 24 23.4 23.8 21.9 22.8C19 20.8 18.2 16.8 20.2 13.9C21 12.8 22.2 11.9 23.6 11.5C22.8 10.5 21.9 10 21 10Z" fill="#3d4f6b"/>
      <path d="M27 12.5 L27.4 11.2 L27.8 12.5 L29.1 12.5 L28.1 13.3 L28.5 14.6 L27.4 13.8 L26.3 14.6 L26.7 13.3 L25.7 12.5 Z" fill="#3d4f6b"/>
      <path d="M29.5 18.5 L29.8 17.5 L30.1 18.5 L31.1 18.5 L30.3 19.1 L30.6 20.1 L29.8 19.5 L29 20.1 L29.3 19.1 L28.5 18.5 Z" fill="#3d4f6b"/>
      <path d="M26.5 24.5 L26.7 23.8 L26.9 24.5 L27.6 24.5 L27.1 25 L27.3 25.7 L26.7 25.3 L26.1 25.7 L26.3 25 L25.8 24.5 Z" fill="#3d4f6b"/>
    </svg>
  );
}

function ThemeToggle() {
  const { isDark, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      title={isDark ? "Chuyển sang chế độ sáng" : "Chuyển sang chế độ tối"}
      style={{
        position: "fixed", top: 14, right: 14, zIndex: 9999,
        background: "none", border: "none", cursor: "pointer",
        padding: 0, lineHeight: 0,
        filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.25))",
        transition: "transform 0.2s, filter 0.2s",
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "scale(1.12)"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = "scale(1)"; }}
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/fabrics" component={Fabrics} />
      <Route path="/viewer" component={Viewer} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ThemeProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <ThemeToggle />
          <Toaster />
        </ThemeProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
