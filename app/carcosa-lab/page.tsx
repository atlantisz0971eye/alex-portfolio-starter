import type { Metadata } from "next";
import Lab from "./Lab";

export const metadata: Metadata = { title: "Carcosa lab", robots: { index: false, follow: false } };

export default function Page() {
  return <Lab />;
}
