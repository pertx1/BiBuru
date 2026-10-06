import type { Metadata, Viewport } from "next";
import { RegisterServiceWorker } from "@/components/pwa/register-sw";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "BiBuru", template: "%s · BiBuru" },
  description: "Tu segundo cerebro para negocios y día a día.",
  applicationName: "BiBuru",
  appleWebApp: { capable: true, title: "BiBuru", statusBarStyle: "black-translucent" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // usa toda la pantalla del iPhone; respetamos áreas seguras en CSS
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f2f7" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-ES" suppressHydrationWarning className="antialiased">
      <body>
        <ThemeProvider>{children}</ThemeProvider>
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
