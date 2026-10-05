import { BottomNav } from "@/components/layout/bottom-nav";
import { Sidebar } from "@/components/layout/sidebar";
import { ToastProvider } from "@/components/ui/toast";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
    <div className="flex min-h-dvh">
      <Sidebar />
      <main className="min-w-0 flex-1 px-4 pt-safe pb-[calc(6rem+env(safe-area-inset-bottom))] md:px-8 md:pb-8">
        <div className="mx-auto w-full max-w-5xl py-6">{children}</div>
      </main>
      <BottomNav />
    </div>
    </ToastProvider>
  );
}
