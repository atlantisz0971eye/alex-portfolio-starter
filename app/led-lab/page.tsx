"use client";

import { useEffect, useRef } from "react";
import { hash, LedPanel } from "../lib/led/engine";
import { sanitize, SAMPLE_OPS } from "../lib/led/ops";
import { NAV_TARGET, SCENES, type SceneId, type State } from "../lib/led/scenes";

/** A prototype of the Workspace as an LED panel. The scenes are hand-written stand-ins for what the AI director will emit. */
export default function LedLab() {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet"; link.href = "https://fonts.googleapis.com/css2?family=Silkscreen:wght@400;700&display=swap";
    document.head.appendChild(link);
    const el = canvas.current!;
    const panel = new LedPanel(el);
    const state: State = { scene: "today", picture: "halftone", hover: null, sceneStart: 0, clock: "14:32", ops: [], opsSince: 0, input: "", status: "" };
    const demo = new URLSearchParams(window.location.search).has("demo");
    if (demo) { state.scene = "director"; state.ops = SAMPLE_OPS; (window as unknown as { __led: unknown }).__led = { setOps: (ops: typeof state.ops) => { state.ops = sanitize(ops); state.opsSince = (performance.now() - t0) / 1000; } }; }
    let trans: { start: number } | null = { start: performance.now() };
    let frame = 0; let alive = true;
    const t0 = performance.now();
    const fit = () => { const dpr = Math.min(2, window.devicePixelRatio || 1); const w = window.innerWidth, h = window.innerHeight; panel.resize(w, h, Math.max(4, Math.min(8, Math.round(w / 320))), dpr); };
    fit();
    // A real input element, hidden, so typing (including Chinese input methods) works while the panel stays pure canvas.
    const box = document.createElement("input");
    box.maxLength = 300; box.setAttribute("aria-label", "Ask the director"); box.autocomplete = "off";
    Object.assign(box.style, { position: "fixed", left: "0", bottom: "0", width: "2px", height: "2px", opacity: "0", border: "0", padding: "0" });
    document.body.appendChild(box);
    const now = () => (performance.now() - t0) / 1000;
    const go = (scene: SceneId) => { if (scene === state.scene) return; state.scene = scene; state.sceneStart = now(); trans = { start: performance.now() }; if (scene === "director") box.focus(); else box.blur(); };
    const ERRORS: Record<string, string> = { unauthorized: "SIGN IN AT /WORKSPACE FIRST", rate_limited: "SLOW DOWN. TRY AGAIN IN A MINUTE", ai_unavailable: "THE AI IS OUT OF REACH OR OUT OF ALLOWANCE", no_picture: "THE DIRECTOR DREW NOTHING. ASK AGAIN", storage_not_configured: "STORAGE NOT CONFIGURED" };
    const ask = async () => {
      const prompt = box.value.trim(); if (!prompt || state.status === "thinking") return;
      state.status = "thinking";
      try {
        const response = await fetch("/api/workspace/led", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt }) });
        const body = await response.json().catch(() => ({})) as { ops?: typeof state.ops; error?: string };
        if (response.ok && body.ops?.length) { state.ops = body.ops; state.opsSince = now(); state.status = ""; box.value = ""; state.input = ""; }
        else state.status = ERRORS[body.error ?? ""] ?? "THE DIRECTOR FAILED. TRY AGAIN";
      } catch { state.status = "NO CONNECTION"; }
    };
    const typing = () => { state.input = box.value; if (state.status !== "thinking") state.status = ""; };
    box.addEventListener("input", typing);
    box.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); void ask(); } });
    const cell = (e: PointerEvent) => { const r = el.getBoundingClientRect(); return { x: Math.floor((e.clientX - r.left) / panel.pitch), y: Math.floor((e.clientY - r.top) / panel.pitch) }; };
    const move = (e: PointerEvent) => { state.hover = cell(e); const c = state.hover; el.style.cursor = panel.hits.some((h) => c.x >= h.x && c.x < h.x + h.w && c.y >= h.y && c.y < h.y + h.h) ? "pointer" : "default"; };
    const click = (e: PointerEvent) => { if (state.scene === "director") box.focus(); const c = cell(e); const h = panel.hits.find((hit) => c.x >= hit.x && c.x < hit.x + hit.w && c.y >= hit.y && c.y < hit.y + hit.h); const target = h && NAV_TARGET[h.id]; if (target) go(target); };
    const modes = [null, "amber", "green", "white"] as const; let mode = 0;
    const key = (e: KeyboardEvent) => { if (state.scene === "director") { if (e.key === "Escape") go("today"); else if (e.target !== box && e.key.length === 1) box.focus(); return; } if (e.key.toLowerCase() === "m") { mode = (mode + 1) % modes.length; panel.mono = modes[mode]; } if (e.key === "1") go("today"); if (e.key === "2") go("library"); if (e.key === "3") go("sync"); if (e.key === "4") { e.preventDefault(); go("director"); } if (e.key.toLowerCase() === "h") state.picture = "halftone"; if (e.key.toLowerCase() === "a") state.picture = "ascii"; };
    const leave = () => { state.hover = null; };
    el.addEventListener("pointermove", move); el.addEventListener("pointerdown", click); el.addEventListener("pointerleave", leave); window.addEventListener("keydown", key); window.addEventListener("resize", fit);
    const loop = () => {
      if (!alive) return;
      const now = performance.now(); const t = (now - t0) / 1000;
      const d = new Date(); state.clock = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      panel.clear();
      SCENES[state.scene](panel, t, state);
      if (state.hover) panel.glow(state.hover.x, state.hover.y, 5, "white", 0.7);
      if (trans) {
        const k = (now - trans.start) / 1100;
        if (k >= 1) trans = null;
        else for (let j = 0; j < panel.rows; j += 1) for (let i = 0; i < panel.cols; i += 1) {
          const n = j * panel.cols + i; const delay = (i / panel.cols) * 0.7 + hash(i, j) * 0.25;
          if (k < delay) panel.target[n] = 0; else if (k < delay + 0.06) { panel.target[n] = 1; panel.colour[n] = 4; }
        }
      }
      panel.render();
      frame = requestAnimationFrame(loop);
    };
    const start = () => { frame = requestAnimationFrame(loop); };
    if (document.fonts?.load) void Promise.all([document.fonts.load("700 8px Silkscreen"), document.fonts.ready]).then(start, start); else start();
    return () => { alive = false; cancelAnimationFrame(frame); el.removeEventListener("pointermove", move); el.removeEventListener("pointerdown", click); el.removeEventListener("pointerleave", leave); window.removeEventListener("keydown", key); window.removeEventListener("resize", fit); link.remove(); box.remove(); };
  }, []);
  return <main style={{ position: "fixed", inset: 0, background: "#050507", overflow: "hidden" }}>
    <canvas ref={canvas} style={{ display: "block" }} aria-label="LED panel prototype" />
    <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "radial-gradient(120% 100% at 50% 40%, transparent 55%, rgba(0,0,0,.55) 100%), linear-gradient(115deg, rgba(255,255,255,.035) 0%, transparent 34%)" }} />
  </main>;
}
