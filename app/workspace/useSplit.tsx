"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent } from "react";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** A pane width the reader can drag, remembered between visits. Double-click the divider to reset it. */
export function useSplit(key: string, fallback: number, min: number, max: number) {
  const [size, setSize] = useState(fallback);
  const drag = useRef<{ x: number; start: number } | null>(null);
  useEffect(() => {
    try { const saved = Number(localStorage.getItem(key)); if (saved >= min && saved <= max) setSize(saved); } catch { /* storage unavailable */ }
  }, [key, min, max]);
  const save = (value: number) => { try { localStorage.setItem(key, String(Math.round(value))); } catch { /* storage unavailable */ } };
  const bind = (direction: 1 | -1 = 1) => ({
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      if ((event.target as HTMLElement).closest("button")) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { x: event.clientX, start: size };
      document.body.classList.add("is-resizing");
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      if (drag.current) setSize(clamp(drag.current.start + (event.clientX - drag.current.x) * direction, min, max));
    },
    onPointerUp: () => {
      if (!drag.current) return;
      drag.current = null;
      document.body.classList.remove("is-resizing");
      setSize((current) => { save(current); return current; });
    },
    onDoubleClick: () => { setSize(fallback); save(fallback); },
  });
  return { size, bind };
}

/** A remembered open/closed flag. */
export function useRemembered(key: string, fallback: string) {
  const [value, setValue] = useState(fallback);
  useEffect(() => { try { const saved = localStorage.getItem(key); if (saved) setValue(saved); } catch { /* storage unavailable */ } }, [key]);
  const update = (next: string) => { setValue(next); try { localStorage.setItem(key, next); } catch { /* storage unavailable */ } };
  return [value, update] as const;
}

/** The draggable line between two panes, with pull tabs that slide a pane away or back. */
export function Divider({ bind, left, right, collapsed = false }: { collapsed?: boolean; bind: ReturnType<ReturnType<typeof useSplit>["bind"]>; left?: { label: string; collapsed: boolean; onToggle: () => void }; right?: { label: string; collapsed: boolean; onToggle: () => void } }) {
  return <div className={`ms-split${collapsed ? " is-collapsed" : ""}`} role="separator" aria-orientation="vertical" {...bind}>
    <div className="ms-split__tabs">
      {left && <button type="button" aria-label={left.label} title={left.label} onClick={left.onToggle}>{left.collapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}</button>}
      {right && <button type="button" aria-label={right.label} title={right.label} onClick={right.onToggle}>{right.collapsed ? <ChevronLeft size={13} /> : <ChevronRight size={13} />}</button>}
    </div>
  </div>;
}
