"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

type SheetProps = { open: boolean; onClose: () => void; title: string; children: ReactNode; size?: "compact" | "tall"; flush?: boolean; primary?: { label: string; onClick: () => void; disabled?: boolean } };

/** Bottom sheet on phones, side panel on wide screens. */
export function Sheet({ open, onClose, title, children, size = "compact", flush = false, primary }: SheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  // Sheets render at the app root so a scrolled page can never carry them out of place.
  const host = typeof document !== "undefined" ? document.querySelector<HTMLElement>(".ws-root") : null;
  const layer = <div className="ws-sheet-layer">
    <div className="ws-sheet-backdrop" onClick={onClose} />
    <section className={`ws-sheet ws-sheet--${size}`} role="dialog" aria-modal="true" aria-label={title}>
      <div className="ws-sheet__grab" aria-hidden="true" />
      <header className="ws-sheet__head">
        <h2>{title}</h2>
        <div className="ws-sheet__actions">
          <button type="button" className="ws-text-button" onClick={onClose}>{primary ? "Cancel" : "Done"}</button>
          {primary && <button type="button" className="ws-text-button ws-text-button--bold" onClick={primary.onClick} disabled={primary.disabled}>{primary.label}</button>}
        </div>
      </header>
      <div className={`ws-sheet__body${flush ? " ws-sheet__body--flush" : ""}`}>{children}</div>
    </section>
  </div>;
  return host ? createPortal(layer, host) : layer;
}
