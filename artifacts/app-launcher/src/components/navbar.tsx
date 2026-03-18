import { LayoutGrid, Search } from "lucide-react";
import { Link } from "wouter";

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 group cursor-pointer">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center text-primary-foreground shadow-sm group-hover:shadow-primary/30 group-hover:scale-105 transition-all">
            <LayoutGrid className="w-5 h-5" />
          </div>
          <span className="font-display font-bold text-xl tracking-tight text-foreground group-hover:text-primary transition-colors">
            AppSpace
          </span>
        </Link>
        
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-muted-foreground">
          <a href="#" className="hover:text-foreground transition-colors">Trang chủ</a>
          <a href="#" className="hover:text-foreground transition-colors">Khám phá</a>
          <a href="#" className="hover:text-foreground transition-colors">Hỗ trợ</a>
        </nav>
        
        <div className="flex items-center gap-4">
          <button className="p-2 rounded-full hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
            <Search className="w-5 h-5" />
          </button>
          <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-cyan-400 to-blue-500 border-2 border-background shadow-sm cursor-pointer hover:shadow-md transition-shadow" />
        </div>
      </div>
    </header>
  );
}
