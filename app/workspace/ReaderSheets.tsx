"use client";

import { Check } from "lucide-react";
import type { Chapter } from "../lib/workspaceOutline";
import { FONT_RANGE, type ReaderFont, type ReaderPrefs, type ReaderTheme } from "./readerPrefs";
import { Sheet } from "./Sheet";

const THEMES: { id: ReaderTheme; label: string }[] = [
  { id: "black", label: "Black" },
  { id: "dark", label: "Dark" },
  { id: "sepia", label: "Sepia" },
  { id: "white", label: "White" },
];
const FONTS: { id: ReaderFont; label: string }[] = [
  { id: "serif", label: "Serif" },
  { id: "sans", label: "Sans" },
  { id: "mono", label: "Mono" },
];
const LEADING = [{ value: 1.4, label: "Compact" }, { value: 1.65, label: "Normal" }, { value: 1.9, label: "Open" }];

type SettingsProps = { open: boolean; onClose: () => void; prefs: ReaderPrefs; update: (patch: Partial<ReaderPrefs>) => void };

export function SettingsSheet({ open, onClose, prefs, update }: SettingsProps) {
  return <Sheet open={open} onClose={onClose} title="Appearance">
    <div className="ws-stepper">
      <button type="button" aria-label="Smaller text" disabled={prefs.fontSize <= FONT_RANGE.min} onClick={() => update({ fontSize: prefs.fontSize - 1 })}><span style={{ fontSize: 14 }}>A</span></button>
      <output>{prefs.fontSize}</output>
      <button type="button" aria-label="Larger text" disabled={prefs.fontSize >= FONT_RANGE.max} onClick={() => update({ fontSize: prefs.fontSize + 1 })}><span style={{ fontSize: 22 }}>A</span></button>
    </div>
    <div className="ws-themes" role="radiogroup" aria-label="Theme">
      {THEMES.map((theme) => <button key={theme.id} type="button" role="radio" aria-checked={prefs.theme === theme.id} className={`ws-theme ws-theme--${theme.id}`} onClick={() => update({ theme: theme.id })}>
        <span>Aa</span><small>{theme.label}</small>{prefs.theme === theme.id && <Check size={14} />}
      </button>)}
    </div>
    <div className="ws-segment" role="radiogroup" aria-label="Font">
      {FONTS.map((font) => <button key={font.id} type="button" role="radio" aria-checked={prefs.font === font.id} className={prefs.font === font.id ? "is-on" : ""} onClick={() => update({ font: font.id })}>{font.label}</button>)}
    </div>
    <div className="ws-segment" role="radiogroup" aria-label="Line spacing">
      {LEADING.map((item) => <button key={item.value} type="button" role="radio" aria-checked={prefs.lineHeight === item.value} className={prefs.lineHeight === item.value ? "is-on" : ""} onClick={() => update({ lineHeight: item.value })}>{item.label}</button>)}
    </div>
    <div className="ws-segment" role="radiogroup" aria-label="Reading mode">
      <button type="button" role="radio" aria-checked={prefs.mode === "page"} className={prefs.mode === "page" ? "is-on" : ""} onClick={() => update({ mode: "page" })}>Paged</button>
      <button type="button" role="radio" aria-checked={prefs.mode === "scroll"} className={prefs.mode === "scroll" ? "is-on" : ""} onClick={() => update({ mode: "scroll" })}>Scrolling</button>
    </div>
  </Sheet>;
}

type ContentsProps = { open: boolean; onClose: () => void; chapters: Chapter[]; starts: number[]; offset: number; totalLength: number; onJump: (offset: number) => void };

export function ContentsSheet({ open, onClose, chapters, starts, offset, totalLength, onJump }: ContentsProps) {
  const items = chapters.length
    ? chapters.map((chapter) => ({ title: chapter.title.replace(" · ", " — "), offset: chapter.offset }))
    : starts.map((start, index) => ({ title: `Section ${index + 1}`, offset: start }));
  let currentIndex = 0;
  items.forEach((item, index) => { if (item.offset <= offset) currentIndex = index; });
  return <Sheet open={open} onClose={onClose} title="Contents" size="tall">
    {!chapters.length && <p className="ws-note">No chapter headings were found, so the book is divided into sections.</p>}
    <ol className="ws-contents">
      {items.map((item, index) => <li key={`${item.offset}-${index}`}>
        <button type="button" className={index === currentIndex ? "is-current" : ""} onClick={() => onJump(item.offset)}>
          <span>{item.title}</span><small>{Math.round((item.offset / Math.max(1, totalLength)) * 100)}%</small>
        </button>
      </li>)}
    </ol>
  </Sheet>;
}
