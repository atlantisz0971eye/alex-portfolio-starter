"use client";

import { useCallback, useEffect, useState } from "react";

export type ReaderTheme = "black" | "dark" | "sepia" | "white";
export type ReaderFont = "serif" | "sans" | "mono";
export type ReaderMode = "page" | "scroll";

export type ReaderPrefs = {
  theme: ReaderTheme;
  font: ReaderFont;
  fontSize: number;
  lineHeight: number;
  mode: ReaderMode;
};

export const DEFAULT_PREFS: ReaderPrefs = { theme: "black", font: "serif", fontSize: 19, lineHeight: 1.65, mode: "page" };
export const FONT_RANGE = { min: 14, max: 32 };
const KEY = "ws-reader-prefs";

function sanitize(value: Partial<ReaderPrefs> | null): ReaderPrefs {
  const next = { ...DEFAULT_PREFS, ...value };
  return {
    theme: ["black", "dark", "sepia", "white"].includes(next.theme) ? next.theme : DEFAULT_PREFS.theme,
    font: ["serif", "sans", "mono"].includes(next.font) ? next.font : DEFAULT_PREFS.font,
    fontSize: Math.min(FONT_RANGE.max, Math.max(FONT_RANGE.min, Math.round(Number(next.fontSize)) || DEFAULT_PREFS.fontSize)),
    lineHeight: [1.4, 1.65, 1.9].includes(next.lineHeight) ? next.lineHeight : DEFAULT_PREFS.lineHeight,
    mode: next.mode === "scroll" ? "scroll" : "page",
  };
}

export function useReaderPrefs() {
  const [prefs, setPrefs] = useState<ReaderPrefs>(DEFAULT_PREFS);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setPrefs(sanitize(JSON.parse(raw)));
    } catch {
      // Private mode or blocked storage: keep defaults.
    }
  }, []);
  const update = useCallback((patch: Partial<ReaderPrefs>) => {
    setPrefs((current) => {
      const next = sanitize({ ...current, ...patch });
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);
  return [prefs, update] as const;
}
