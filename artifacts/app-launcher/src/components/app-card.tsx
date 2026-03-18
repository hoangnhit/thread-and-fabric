import { AppItem } from "@/hooks/use-apps";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

interface AppCardProps {
  app: AppItem;
}

export function AppCard({ app }: AppCardProps) {
  const handleOpen = () => {
    if (app.url !== "#") {
      window.open(app.url, "_blank", "noopener,noreferrer");
    } else {
      alert("Ứng dụng này hiện chưa có đường dẫn khả dụng.");
    }
  };

  return (
    <div className="group relative flex flex-col h-full bg-card rounded-2xl p-6 shadow-sm border border-border/60 hover:shadow-xl hover:border-primary/30 transition-all duration-300">
      
      {/* Decorative gradient blur behind the icon */}
      <div className="absolute top-6 left-6 w-14 h-14 bg-gradient-to-br from-primary/20 to-transparent rounded-full blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      
      <div className="flex items-start justify-between mb-4 relative z-10">
        <div className={cn(
          "w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shadow-inner bg-gradient-to-br transition-transform duration-300 group-hover:scale-110",
          app.colorClass
        )}>
          {app.icon}
        </div>
        
        <span className="px-3 py-1 text-xs font-semibold rounded-full bg-secondary text-secondary-foreground">
          {app.category}
        </span>
      </div>

      <div className="flex-1 z-10">
        <h3 className="text-xl font-bold text-foreground mb-2 group-hover:text-primary transition-colors">
          {app.name}
        </h3>
        <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">
          {app.description}
        </p>
      </div>

      <div className="mt-6 z-10">
        <Button 
          onClick={handleOpen} 
          className="w-full justify-between"
          variant={app.featured ? "default" : "outline"}
        >
          <span>Mở ứng dụng</span>
          <ExternalLink className="w-4 h-4 ml-2 opacity-70 group-hover:opacity-100 transition-opacity" />
        </Button>
      </div>
    </div>
  );
}

export function AppCardSkeleton() {
  return (
    <div className="flex flex-col h-full bg-card rounded-2xl p-6 shadow-sm border border-border/60">
      <div className="flex items-start justify-between mb-4">
        <Skeleton className="w-14 h-14 rounded-2xl" />
        <Skeleton className="w-20 h-6 rounded-full" />
      </div>
      <div className="flex-1 mt-2 space-y-3">
        <Skeleton className="w-3/4 h-7" />
        <Skeleton className="w-full h-4" />
        <Skeleton className="w-5/6 h-4" />
      </div>
      <div className="mt-6">
        <Skeleton className="w-full h-11 rounded-xl" />
      </div>
    </div>
  );
}
