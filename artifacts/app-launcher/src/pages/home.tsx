import { useState, useMemo } from "react";
import { useApps, AppCategory } from "@/hooks/use-apps";
import { AppCard, AppCardSkeleton } from "@/components/app-card";
import { Navbar } from "@/components/navbar";
import { Input } from "@/components/ui/input";
import { Search, Sparkles, Grid3X3 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

const CATEGORIES: AppCategory[] = ["Tất cả", "Công cụ", "Giải trí", "Năng suất", "Tiện ích"];

export default function Home() {
  const { data: apps, isLoading } = useApps();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<AppCategory>("Tất cả");

  const filteredApps = useMemo(() => {
    if (!apps) return [];
    return apps.filter((app) => {
      const matchesSearch = 
        app.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        app.description.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = activeCategory === "Tất cả" || app.category === activeCategory;
      return matchesSearch && matchesCategory;
    });
  }, [apps, searchQuery, activeCategory]);

  const featuredApps = useMemo(() => {
    if (!apps) return [];
    return apps.filter(app => app.featured);
  }, [apps]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />

      <main className="flex-1 flex flex-col">
        {/* Hero Section */}
        <section className="relative pt-20 pb-24 md:pt-32 md:pb-36 px-4 overflow-hidden border-b border-border/50">
          <div className="absolute inset-0 z-0">
            <img 
              src={`${import.meta.env.BASE_URL}images/hero-bg.png`} 
              alt="Hero background" 
              className="w-full h-full object-cover opacity-15 dark:opacity-20 mix-blend-luminosity"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-background/50 via-background/80 to-background" />
          </div>
          
          <div className="max-w-4xl mx-auto relative z-10 text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary font-semibold text-sm mb-6 border border-primary/20">
              <Sparkles className="w-4 h-4" />
              <span>Phiên bản Mới 2.0</span>
            </div>
            
            <h1 className="text-5xl md:text-7xl font-display font-extrabold text-foreground tracking-tight mb-6 leading-tight">
              Khám phá thế giới <br className="hidden md:block" />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-cyan-500">
                ứng dụng của bạn
              </span>
            </h1>
            
            <p className="text-lg md:text-xl text-muted-foreground mb-10 max-w-2xl mx-auto">
              Trung tâm điều khiển tất cả trong một. Tìm kiếm, khởi chạy và tổ chức các ứng dụng yêu thích của bạn mà không cần cài đặt.
            </p>

            <div className="max-w-2xl mx-auto relative group">
              <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
              </div>
              <Input
                type="text"
                placeholder="Tìm kiếm ứng dụng, công cụ..."
                className="pl-12 h-16 text-lg rounded-2xl shadow-lg shadow-black/5"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </section>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 w-full">
          
          {/* Categories */}
          <div className="flex flex-wrap items-center justify-center gap-3 mb-16">
            {CATEGORIES.map((category) => (
              <button
                key={category}
                onClick={() => setActiveCategory(category)}
                className={cn(
                  "px-6 py-2.5 rounded-full text-sm font-medium transition-all duration-300",
                  activeCategory === category
                    ? "bg-primary text-primary-foreground shadow-md shadow-primary/20 scale-105"
                    : "bg-secondary text-secondary-foreground hover:bg-secondary/80 hover:scale-105"
                )}
              >
                {category}
              </button>
            ))}
          </div>

          {/* Featured Section (only show if viewing All and no search) */}
          {activeCategory === "Tất cả" && !searchQuery && !isLoading && (
            <div className="mb-16">
              <div className="flex items-center gap-2 mb-8">
                <Sparkles className="w-6 h-6 text-amber-500" />
                <h2 className="text-2xl font-bold text-foreground">Ứng dụng nổi bật</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {featuredApps.map(app => (
                  <AppCard key={`featured-${app.id}`} app={app} />
                ))}
              </div>
            </div>
          )}

          {/* Main Grid Section */}
          <div>
            <div className="flex items-center gap-2 mb-8">
              <Grid3X3 className="w-6 h-6 text-primary" />
              <h2 className="text-2xl font-bold text-foreground">
                {activeCategory === "Tất cả" ? "Tất cả ứng dụng" : `Danh mục: ${activeCategory}`}
              </h2>
              <span className="ml-2 px-3 py-1 bg-secondary rounded-full text-xs font-bold text-muted-foreground">
                {isLoading ? "..." : filteredApps.length}
              </span>
            </div>

            {isLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {Array.from({ length: 8 }).map((_, i) => (
                  <AppCardSkeleton key={i} />
                ))}
              </div>
            ) : filteredApps.length > 0 ? (
              <motion.div 
                layout 
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
              >
                <AnimatePresence mode="popLayout">
                  {filteredApps.map(app => (
                    <motion.div
                      key={app.id}
                      layout
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      transition={{ duration: 0.2 }}
                    >
                      <AppCard app={app} />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </motion.div>
            ) : (
              <div className="text-center py-24 bg-secondary/50 rounded-3xl border border-dashed border-border">
                <div className="w-20 h-20 bg-background rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm">
                  <Search className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="text-xl font-bold text-foreground mb-2">Không tìm thấy ứng dụng</h3>
                <p className="text-muted-foreground">
                  Rất tiếc, chúng tôi không tìm thấy ứng dụng nào khớp với tìm kiếm của bạn.
                </p>
                <button 
                  onClick={() => { setSearchQuery(""); setActiveCategory("Tất cả"); }}
                  className="mt-6 text-primary font-medium hover:underline"
                >
                  Xóa bộ lọc
                </button>
              </div>
            )}
          </div>
        </div>
      </main>
      
      {/* Footer */}
      <footer className="border-t border-border py-8 text-center text-muted-foreground text-sm">
        <p>© {new Date().getFullYear()} AppSpace Launcher. Không yêu cầu cài đặt.</p>
      </footer>
    </div>
  );
}
