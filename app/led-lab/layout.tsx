import type { Metadata } from "next";

export const metadata: Metadata = { title: "LED panel", robots: { index: false, follow: false } };

export default function LedLabLayout({ children }: { children: React.ReactNode }) {
  return children;
}
