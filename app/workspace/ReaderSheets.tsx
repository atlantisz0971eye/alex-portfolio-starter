"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import type { WorkspaceMark } from "../lib/workspaceStore";
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

type SettingsProps = { open: boolean; onClose: () => void; prefs: ReaderPrefs; update: (patch: Partial<ReaderPrefs>) => void; pdf?: boolean };

export function SettingsSheet({ open, onClose, prefs, update, pdf }: SettingsProps) {
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
    <div className="ws-segment" role="radiogroup" aria-label="Chinese translation">
      <button type="button" role="radio" aria-checked={prefs.bilingual === "off"} className={prefs.bilingual === "off" ? "is-on" : ""} onClick={() => update({ bilingual: "off" })}>No translation</button>
      <button type="button" role="radio" aria-checked={prefs.bilingual === "below"} className={prefs.bilingual === "below" ? "is-on" : ""} onClick={() => update({ bilingual: "below" })}>Chinese under text</button>
    </div>
    <div className="ws-segment" role="radiogroup" aria-label="Reading mode">
      <button type="button" role="radio" aria-checked={prefs.mode === "page"} className={prefs.mode === "page" ? "is-on" : ""} onClick={() => update({ mode: "page" })}>Paged</button>
      <button type="button" role="radio" aria-checked={prefs.mode === "scroll"} className={prefs.mode === "scroll" ? "is-on" : ""} onClick={() => update({ mode: "scroll" })}>Scrolling</button>
      {pdf && <button type="button" role="radio" aria-checked={prefs.mode === "original"} className={prefs.mode === "original" ? "is-on" : ""} onClick={() => update({ mode: "original" })}>Original</button>}
    </div>
  </Sheet>;
}

type ContentsProps = { open: boolean; onClose: () => void; chapters: Chapter[]; starts: number[]; offset: number; totalLength: number; marks: WorkspaceMark[]; onJump: (offset: number) => void; onRebuild?: () => void; rebuilding?: boolean };

export function ContentsSheet({ open, onClose, chapters, starts, offset, totalLength, marks, onJump, onRebuild, rebuilding }: ContentsProps) {
  const [tab, setTab] = useState<"contents" | "highlights">("contents");
  const items = chapters.length
    ? chapters.map((chapter) => ({ title: chapter.title.replace(" · ", " — "), offset: chapter.offset }))
    : starts.map((start, index) => ({ title: `Section ${index + 1}`, offset: start }));
  let currentIndex = 0;
  items.forEach((item, index) => { if (item.offset <= offset) currentIndex = index; });
  const sortedMarks = [...marks].sort((x, y) => x.blockOffset + x.from - (y.blockOffset + y.from));
  return <Sheet open={open} onClose={onClose} title={tab === "contents" ? "Contents" : "Highlights"} size="tall">
    <div className="ws-segment" role="tablist">
      <button type="button" role="tab" aria-selected={tab === "contents"} className={tab === "contents" ? "is-on" : ""} onClick={() => setTab("contents")}>Contents</button>
      <button type="button" role="tab" aria-selected={tab === "highlights"} className={tab === "highlights" ? "is-on" : ""} onClick={() => setTab("highlights")}>Highlights{marks.length ? ` · ${marks.length}` : ""}</button>
    </div>
    {tab === "contents" ? <>
      {!chapters.length && <p className="ws-note">No chapter headings were found, so the book is divided into sections.</p>}
      {onRebuild && <button type="button" className="ws-pill ws-contents__rebuild" onClick={onRebuild} disabled={rebuilding}>{rebuilding ? "Reading the contents…" : "Read the contents again with AI"}</button>}
      <ol className="ws-contents">
        {items.map((item, index) => <li key={`${item.offset}-${index}`}>
          <button type="button" className={index === currentIndex ? "is-current" : ""} onClick={() => onJump(item.offset)}>
            <span>{item.title}</span><small>{Math.round((item.offset / Math.max(1, totalLength)) * 100)}%</small>
          </button>
        </li>)}
      </ol>
    </> : sortedMarks.length === 0 ? <p className="ws-note">Select text and tap Highlight to save passages here.</p> : <ul className="ws-marks">
      {sortedMarks.map((mark) => <li key={mark.id}>
        <button type="button" onClick={() => onJump(mark.blockOffset)}>
          <span className={`ws-marks__text hl-${mark.color}`}>{mark.text.slice(0, 220)}{mark.text.length > 220 ? "…" : ""}</span>
          {mark.note && <em>{mark.note}</em>}
        </button>
      </li>)}
    </ul>}
  </Sheet>;
}
