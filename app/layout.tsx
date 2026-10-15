import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Alex · 科技 / 反刍 / 连接 Portfolio",
  description: "Three-layer narrative portfolio scaffold: Technology · Rumination · Connection",
};

// viewport-fit=cover lets env(safe-area-inset-*) report the iPhone notch and
// home indicator, which the glass navigation relies on.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f6f3ec",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://api.fontshare.com" />
        <link
          href="https://api.fontshare.com/v2/css?f[]=satoshi@300,400,500,700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-satoshi">{children}</body>
    </html>
  );
}
