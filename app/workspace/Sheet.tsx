"use client";

import { useEffect, type ReactNode } from "react";

type SheetProps = { open: boolean; onClose: () => void; title: string; children: ReactNode; size?: "compact" | "tall"; flush?: boolean };

/** Bottom sheet on phones, side panel on wide screens. */
export function Sheet({ open, onClose, title, children, size = "compact", flush = false }: SheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return <div className="ws-sheet-layer">
    <div className="ws-sheet-backdrop" onClick={onClose} />
    <section className={`ws-sheet ws-sheet--${size}`} role="dialog" aria-modal="true" aria-label={title}>
      <div className="ws-sheet__grab" aria-hidden="true" />
      <header className="ws-sheet__head">
        <h2>{title}</h2>
        <button type="button" className="ws-text-button" onClick={onClose}>Done</button>
      </header>
      <div className={`ws-sheet__body${flush ? " ws-sheet__body--flush" : ""}`}>{children}</div>
    </section>
  </div>;
}
