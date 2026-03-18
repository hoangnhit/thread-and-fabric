import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { LayoutGrid, AlertCircle } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-md text-center bg-card p-10 rounded-3xl border border-border shadow-xl shadow-black/5">
        <div className="w-20 h-20 bg-destructive/10 rounded-full flex items-center justify-center mx-auto mb-6">
          <AlertCircle className="w-10 h-10 text-destructive" />
        </div>
        <h1 className="text-4xl font-display font-bold text-foreground mb-4">404</h1>
        <h2 className="text-xl font-semibold text-foreground mb-4">Không tìm thấy trang</h2>
        <p className="text-muted-foreground mb-8">
          Trang bạn đang cố truy cập không tồn tại hoặc đã bị gỡ bỏ khỏi hệ thống.
        </p>
        <Link href="/" className="inline-block">
          <Button size="lg" className="w-full sm:w-auto gap-2">
            <LayoutGrid className="w-4 h-4" />
            Về trang chủ ứng dụng
          </Button>
        </Link>
      </div>
    </div>
  );
}
