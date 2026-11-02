import type { Colour, LedPanel } from "./engine";
import { planet, rings, runOps, stripes, terrain, type Op } from "./ops";

/**
 * Scenes: what to light, where. Each one is a plain function from the panel and the time to a set of painter calls.
 * They are written by hand for now; the point of the shape is that a server (and an AI) can emit the same calls as data.
 */
export type SceneId = "today" | "library" | "sync" | "director";
export type State = { scene: SceneId; picture: "halftone" | "ascii"; hover: { x: number; y: number } | null; sceneStart: number; clock: string; ops: Op[]; opsSince: number; input: string; status: string };

const NAV: { id: SceneId | "mail" | "calendar" | "mind"; label: string; roman: string }[] = [
  { id: "today", label: "TODAY", roman: "I" }, { id: "library", label: "LIBRARY", roman: "II" }, { id: "mail", label: "MAIL", roman: "III" },
  { id: "calendar", label: "EVENTS", roman: "IV" }, { id: "mind", label: "MINDS", roman: "V" }, { id: "sync", label: "SYNC", roman: "VI" },
  { id: "director", label: "ASK AI", roman: "VII" },
];

const ROBOT = [" .----. ", "| o  o |", "|  __  |", " '----' ", "  |  |  "];
const CLOUD = ["      .--.      ", "   .-(    ).    ", "  (___.__)__)   ", "       ^        ", "       |        "];

const RAIL = 72;
const fit = (str: string, chars: number) => (str.length > chars ? `${str.slice(0, chars - 1)}~` : str);

function chrome(p: LedPanel, t: number, S: State) {
  p.text("ALEX", 4, 5, { scale: 2, colour: "amber" });
  p.text("WORKSPACE", 4, 24, { colour: "white", lum: 0.45 });
  NAV.forEach((item, n) => {
    const y = 40 + n * 14; const active = item.id === S.scene;
    if (active) { p.rect(1, y - 3, RAIL - 4, 13, 0.95, "amber"); p.text(item.roman, 4, y, { erase: true }); p.text(item.label, 25, y, { erase: true }); }
    else { p.text(item.roman, 4, y, { colour: "red", lum: 0.9 }); p.text(item.label, 25, y, { colour: "white", lum: 0.62 }); }
    p.hit(item.id, 1, y - 3, RAIL - 4, 13);
  });
  // a column of dots that fade downward: the halftone edge of the rail
  for (let j = 0; j < p.rows; j += 1) { const v = 0.55 * (1 - j / p.rows); p.set(RAIL, j, v, "amber"); if (j % 2 === 0) p.set(RAIL + 2, j, v * 0.55, "amber"); if (j % 4 === 0) p.set(RAIL + 4, j, v * 0.3, "amber"); }
  // the AI director: the thing that is meant to be driving all of this
  const y0 = p.rows - 62;
  p.ascii(ROBOT.map((line, i) => (i === 1 && Math.floor(t * 1.3) % 6 === 0 ? line.replace(/o/g, "-") : line)), 12, y0, { colour: "cyan", lum: 0.85 });
  p.text("DIRECTOR", 12, y0 + 48, { colour: "cyan", lum: 0.9 });
  p.rect(4, y0 + 49, 4, 4, 0.6 + 0.4 * Math.sin(t * 3), "green");
  return RAIL;
}

function footer(p: LedPanel, t: number, S: State, x: number) {
  const full = `COMPOSING ${S.scene.toUpperCase()} ... DONE`; const n = Math.min(full.length, Math.floor((t - S.sceneStart) * 22));
  p.text(`> ${full.slice(0, n)}${n < full.length && Math.floor(t * 4) % 2 === 0 ? "_" : ""}`, x, p.rows - 21, { colour: "cyan", lum: 0.85 });
  p.text("1-4 SCENE  H HALFTONE  A ASCII  M MONO", x, p.rows - 10, { colour: "white", lum: 0.3 });
}

function title(p: LedPanel, word: string, mx: number) {
  p.text(word, mx, 5, { scale: 3, colour: "amber" });
  const w = p.cols - mx - 8;
  for (let i = 0; i < w; i += 1) { const v = Math.max(0, 1 - i / w); p.set(mx + i, 31, v, "amber"); if (i % 2 === 0) p.set(mx + i, 33, v * 0.6, "amber"); if (i % 3 === 0) p.set(mx + i, 35, v * 0.3, "amber"); }
}

function picture(p: LedPanel, S: State, x: number, y: number, w: number, h: number, tone: (u: number, v: number) => number, colour: Colour) {
  if (S.picture === "halftone") p.halftone(x, y, w, h, tone, colour, 0.8); else p.asciiPicture(x, y, w, h, tone, "green");
}

export function today(p: LedPanel, t: number, S: State) {
  const mx = chrome(p, t, S) + 8; const px = p.cols - 60; const right = px - 10;
  title(p, "TODAY", mx);
  p.text(S.clock, mx + 100, 6, { scale: 2, colour: "white", lum: 0.9 }); p.text("MON 2 NOV", mx + 100, 24, { colour: "white", lum: 0.45 });

  p.text("PLAN", mx, 44, { colour: "cyan" }); p.rect(mx + 28, 47, 3, 3, 1, "cyan");
  p.paragraph("评图提前到周四，待你确认\n读完 Ways of Being 第三章\n下午去工作室", mx, 56, right - mx, 14, { font: "cjk", size: 12, colour: "white", lum: 0.92 });

  p.text("SCHEDULE", mx, 106, { colour: "green" }); p.rect(mx + 52, 109, 3, 3, 1, "green");
  const events: [string, string, Colour][] = [["11:30", "AcrossRCA 线上读书会", "green"], ["16:00", "Computing 预约", "amber"], ["19:00", "Studio crit", "blue"]];
  events.forEach(([time, name, colour], n) => { const y = 118 + n * 15; p.rect(mx, y, 2, 11, 0.95, colour); p.text(time, mx + 6, y + 2, { colour, lum: 0.95 }); p.text(name, mx + 42, y - 1, { font: "cjk", size: 12, colour: "white", lum: 0.85 }); });

  picture(p, S, px + 4, 6, 44, 44, planet(t), "amber");
  p.text(S.picture === "halftone" ? "SUN 07:12" : "SUN ASCII", px + 1, 54, { colour: "amber", lum: 0.6 });
  p.text("SYNC", px, 68, { colour: "green" }); p.rect(px + 28, 69, 4, 4, 0.6 + 0.4 * Math.sin(t * 3), "green");
  [["ANTS", 0.82, "green"], ["LEAVES", 0.4 + 0.1 * Math.sin(t), "amber"], ["FOLIO", 1, "green"], ["YASMINE", 0.3, "red"]].forEach(([name, value, colour], n) => {
    p.text(String(name), px, 80 + n * 15, { colour: "white", lum: 0.5 }); p.bar(px, 89 + n * 15, 52, 5, Number(value), colour as Colour);
  });
  p.text("NEW MAIL", px, 144, { colour: "red" }); p.text("3", px, 156, { scale: 3, colour: "red", lum: 0.95 });

  const msg = "RCA: STUDIO CRIT MOVED TO THURSDAY  //  ACADEMIA.EDU: HERE'S YOUR DOWNLOAD  //  SHOP: 188135 IS YOUR SIGN-IN CODE  //  ";
  const mw = p.measure(msg); const y = p.rows - 38; p.frame(mx - 2, y - 3, right - mx + 4, 14, 0.25, "red");
  const off = (t * 26) % mw;
  for (const dx of [0, mw]) p.text(msg, mx + 2 - off + dx, y, { colour: "red", lum: 0.9, clip: [mx, right] });
  footer(p, t, S, mx);
}

export function library(p: LedPanel, t: number, S: State) {
  const mx = chrome(p, t, S) + 8;
  title(p, "LIBRARY", mx);
  p.text("CONTINUE READING", mx, 44, { colour: "cyan" });
  p.text("STAYING WITH THE TROUBLE", mx, 56, { colour: "white", lum: 0.9 }); p.bar(mx, 67, 120, 6, 0.3, "cyan"); p.text("30%", mx + 126, 68, { colour: "cyan", lum: 0.9 });
  const books: [string, string, number, (u: number, v: number) => number, Colour][] = [
    ["TROUBLE", "HARAWAY", 0.3, rings(0), "amber"], ["BEING", "BRIDLE", 0.05, stripes(1), "cyan"], ["CARRIER", "LE GUIN", 0, terrain(2), "green"],
    ["ECOLOGY", "MORTON", 0.62, rings(3), "magenta"], ["PLATEAU", "DELEUZE", 0.12, stripes(4), "amber"],
  ];
  const gap = 10, w = Math.floor((p.cols - mx - 8 - gap * 4) / 5), h = Math.round(w * 1.4), y = 84;
  books.forEach(([name, author, progress, tone, colour], n) => {
    const x = mx + n * (w + gap); const hover = S.hover && S.hover.x >= x && S.hover.x < x + w && S.hover.y >= y && S.hover.y < y + h + 36;
    picture(p, S, x, y, w, h, tone, colour);
    p.frame(x - 2, y - 2, w + 4, h + 4, hover ? 1 : 0.25, hover ? "white" : colour);
    p.text(name, x, y + h + 6, { colour: "white", lum: hover ? 1 : 0.75 }); p.text(author, x, y + h + 15, { colour: "white", lum: hover ? 0.85 : 0.4 });
    if (progress > 0) p.bar(x, y + h + 25, w, 4, progress, colour); else p.text("NEW", x, y + h + 25, { colour: "green" });
    p.hit(`book${n}`, x, y, w, h + 30);
  });
  footer(p, t, S, mx);
}

export function sync(p: LedPanel, t: number, S: State) {
  const mx = chrome(p, t, S) + 8;
  title(p, "SYNC", mx);
  const bob = Math.round(1.5 * Math.sin(t * 2));
  p.ascii(CLOUD.map((l, i) => (i >= 3 && Math.floor(t * 3) % 2 === 0 ? l.replace("^", "|") : l)), mx, 46 + bob, { colour: "cyan", lum: 0.9 });
  p.text("MACBOOK", mx, 98, { colour: "white", lum: 0.95 }); p.rect(mx, 111, 4, 4, 1, "green"); p.text("ONLINE", mx + 8, 110, { colour: "green" });
  p.text("HEARD 12S AGO", mx, 122, { colour: "white", lum: 0.4 });
  const folders: [string, string, number, Colour, string][] = [
    ["ANTS", "998 FILES 467 MB", 1, "green", "IDLE"], ["LEAVES", "1515 FILES", 0.46 + 0.04 * Math.sin(t * 2), "amber", "SYNCING"],
    ["PORTFOLIO", "842 FILES 1.2 GB", 1, "green", "IDLE"], ["YASMINE", "COPY ONLY", 0.2, "red", "ERROR"],
  ];
  const fx = mx + 112, fr = p.cols - 8;
  folders.forEach(([name, meta, value, colour, state], n) => {
    const y = 46 + n * 24; const blink = state === "SYNCING" ? 0.55 + 0.45 * Math.abs(Math.sin(t * 3)) : 1;
    p.rect(fx, y, 4, 4, blink, colour); p.text(fit(name, 12), fx + 9, y - 1, { colour: "white", lum: 0.95 }); p.text(state, fr, y - 1, { colour, align: "right" });
    p.bar(fx + 9, y + 8, fr - fx - 9, 4, value, colour); p.text(meta, fx + 9, y + 14, { colour: "white", lum: 0.4 });
  });
  const log = ["15:59 SYNCED ANTS", "15:59 NO INTERNET", "15:12 STARTED"];
  p.text("ACTIVITY", fx, 144, { colour: "magenta" });
  log.forEach((l, n) => p.text(l, fx, 154 + n * 8, { colour: "white", lum: 0.6 - n * 0.12 }));
  footer(p, t, S, mx);
}

/** The scene the director writes. Its picture is whatever ops the model last returned; the line at the bottom is where you ask. */
const ASCII_ONLY = /^[\u0020-\u007e]*$/;
const HINTS = ["THIS WEEK'S SCHEDULE", "SYNC STATUS AS A DASHBOARD", "A POSTER OF MY DAY", "本周的日程"];
export function director(p: LedPanel, t: number, S: State) {
  const mx = chrome(p, t, S) + 8;
  title(p, "ASK AI", mx);
  if (S.ops.length) runOps(p, S.ops, t, S.opsSince);
  else {
    p.text("TELL THE DIRECTOR WHAT TO SHOW", mx, 46, { colour: "white", lum: 0.8 });
    HINTS.forEach((line, n) => (ASCII_ONLY.test(line) ? p.text(`> ${line}`, mx, 62 + n * 12, { colour: "cyan", lum: 0.6 }) : p.text(`> ${line}`, mx, 60 + n * 12, { font: "cjk", colour: "cyan", lum: 0.6 })));
  }
  const busy = S.status === "thinking";
  const cursor = Math.floor(t * 2) % 2 === 0 ? "_" : " ";
  const room = p.cols - mx - 14;
  p.rect(mx - 2, p.rows - 36, p.cols - mx - 4, 14, 0, "cyan");
  p.frame(mx - 2, p.rows - 36, p.cols - mx - 4, 14, busy ? 0.9 : 0.4, busy ? "amber" : "cyan");
  if (ASCII_ONLY.test(S.input)) p.text(`> ${S.input}${cursor}`.slice(-Math.floor(room / 6)), mx + 2, p.rows - 33, { colour: "white", lum: 0.95 });
  else p.text(`> ${S.input}${cursor}`, mx + 2, p.rows - 36, { font: "cjk", colour: "white", lum: 0.95, clip: [mx, p.cols - 8] });
  const dots = ".".repeat(Math.floor(t * 3) % 4);
  const failed = !!S.status && !busy;
  const status = busy ? `THINKING${dots}` : failed ? S.status : S.ops.length ? `${S.ops.length} OPS // ENTER TO ASK AGAIN` : "ENTER TO SEND  //  ESC TO LEAVE";
  p.text(status, mx, p.rows - 14, { colour: busy ? "amber" : failed ? "red" : "white", lum: busy ? 0.9 : failed ? 0.95 : 0.5 });
}

export const SCENES: Record<SceneId, (p: LedPanel, t: number, S: State) => void> = { today, library, sync, director };
export const NAV_TARGET: Record<string, SceneId | undefined> = { today: "today", library: "library", sync: "sync", director: "director" };
