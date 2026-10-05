import { BottomNav } from "@/components/layout/bottom-nav";
import { OfflineBanner } from "@/components/layout/offline-banner";
import { Sidebar } from "@/components/layout/sidebar";
import { CaptureProvider } from "@/components/capture/capture-provider";
import { SearchPalette } from "@/components/search/search-palette";
import { ToastProvider } from "@/components/ui/toast";
import { countInbox } from "@/lib/notes/data";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const inboxCount = await countInbox().catch(() => 0);
  return (
    <ToastProvider>
    <CaptureProvider>
    <OfflineBanner />
    <div className="flex min-h-dvh">
      <Sidebar inboxCount={inboxCount} />
      <main className="min-w-0 flex-1 px-4 pt-safe pb-[calc(6rem+env(safe-area-inset-bottom))] md:px-8 md:pb-8">
        <div className="mx-auto w-full max-w-5xl py-6">{children}</div>
      </main>
      <BottomNav inboxCount={inboxCount} />
    </div>
    <SearchPalette />
    </CaptureProvider>
    </ToastProvider>
  );
}
