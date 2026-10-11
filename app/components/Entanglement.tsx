"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { getOrbitCategories } from "../data/orbit";
import { entanglementNarrative, entanglementPaths, entanglementPosition, sortEntanglementPoints, type EntanglementHarmonic, type EntanglementPoint, type EntanglementSelection } from "../lib/entanglement";
import { closeEntanglementSound, createEntanglementSound, updateEntanglementSound, type EntanglementSound } from "../lib/entanglementAudio";
import type { Language } from "../types/project";
import "./Entanglement.css";

const TAU = Math.PI * 2;
const DRAW_SECONDS = 18;

export function Entanglement({ lang, searchSelection }: { lang: Language; searchSelection?: EntanglementPoint | null }) {
  const root = useRef<HTMLDivElement>(null);
  const sound = useRef<EntanglementSound | null>(null);
  const narrativeCache = useRef(new Map<string, string>());
  const pointerOverCircle = useRef([false, false, false]);
  const focusWithinCircle = useRef([false, false, false]);
  const categories = useMemo(() => getOrbitCategories(lang), [lang]);
  const [points, setPoints] = useState<EntanglementPoint[]>([]);
  const [phase, setPhase] = useState(0);
  const [circlePhases, setCirclePhases] = useState<[number, number, number]>([0, 0, 0]);
  const [drawStart, setDrawStart] = useState(0);
  const [drawProgress, setDrawProgress] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [visible, setVisible] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const [narrativeResult, setNarrativeResult] = useState<{
    key: string;
    status: "loading" | "ready" | "error";
    text?: string;
  } | null>(null);
  const orderedPoints = useMemo(() => sortEntanglementPoints(points), [points]);
  const complete = points.length === 3;
  const narrativeKey = complete ? `${lang}:${orderedPoints.map(({ category, point }) => `${category}-${point}`).join("|")}` : null;
  const harmonics = useMemo(() => complete
    ? orderedPoints.map(({ category, point }) => ({
      category,
      point,
      fraction: point / categories.find((item) => item.id === category)!.works.length,
    })) as EntanglementHarmonic[]
    : null, [categories, complete, orderedPoints]);
  const selected = complete ? orderedPoints.map(({ category, point }) => ({
    category,
    point,
    work: categories.find((item) => item.id === category)!.works[point],
  })) as EntanglementSelection[] : null;
  const paths = useMemo(() => harmonics
    ? entanglementPaths(harmonics, drawProgress, drawStart)
    : null, [harmonics, drawProgress, drawStart]);

  useEffect(() => {
    if (!searchSelection) return;
    setPoints((previous) => previous.some(({ category, point }) =>
      category === searchSelection.category && point === searchSelection.point
    ) ? previous : [...(previous.length === 3 ? previous.slice(1) : previous), searchSelection]);
    setDrawStart(0);
    setDrawProgress(0);
  }, [searchSelection]);

  useEffect(() => {
    if (!narrativeKey) {
      setNarrativeResult(null);
      return;
    }
    const cached = narrativeCache.current.get(narrativeKey);
    if (cached) {
      setNarrativeResult({ key: narrativeKey, status: "ready", text: cached });
      return;
    }

    setNarrativeResult({ key: narrativeKey, status: "loading" });
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/entanglement/narrative", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lang, selections: orderedPoints }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Narrative generation unavailable");
        const result = await response.json() as { narrative?: unknown };
        if (typeof result.narrative !== "string" || !result.narrative.trim()) {
          throw new Error("Empty narrative response");
        }
        if (controller.signal.aborted) return;
        narrativeCache.current.set(narrativeKey, result.narrative);
        setNarrativeResult({ key: narrativeKey, status: "ready", text: result.narrative });
      } catch {
        if (!controller.signal.aborted) setNarrativeResult({ key: narrativeKey, status: "error" });
      }
    }, 600);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [lang, narrativeKey, orderedPoints]);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.05 });
    if (root.current) observer.observe(root.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const update = () => setPageVisible(document.visibilityState === "visible");
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  useEffect(() => () => {
    if (sound.current) closeEntanglementSound(sound.current);
    sound.current = null;
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!playing || !visible || reducedMotion) return;
    let frame = 0;
    let previous = performance.now();
    let elapsed = 0;
    const tick = (now: number) => {
      elapsed += Math.min((now - previous) / 1000, 0.05);
      previous = now;
      if (elapsed >= 1 / 30) {
        const step = elapsed;
        elapsed = 0;
        const advance = TAU * step / DRAW_SECONDS;
        setPhase((value) => (value + advance) % TAU);
        setCirclePhases((values) => values.map((value, index) =>
          pointerOverCircle.current[index] || focusWithinCircle.current[index]
            ? value
            : (value + advance) % TAU
        ) as [number, number, number]);
        if (complete) setDrawProgress((value) => Math.min(1, value + step / DRAW_SECONDS));
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [complete, playing, reducedMotion, visible]);

  useEffect(() => {
    if (reducedMotion && complete) setDrawProgress(1);
  }, [complete, reducedMotion]);

  useEffect(() => {
    if (!sound.current) return;
    const audible = soundOn && complete && playing && visible && pageVisible;
    updateEntanglementSound(sound.current, harmonics ? entanglementPosition(harmonics, phase) : null, audible);
  }, [complete, harmonics, pageVisible, phase, playing, soundOn, visible]);

  const toggleSound = async () => {
    if (soundOn) {
      setSoundOn(false);
      return;
    }
    try {
      sound.current ??= createEntanglementSound();
      await sound.current.context.resume();
      setSoundOn(true);
    } catch {
      setSoundOn(false);
    }
  };

  const selectPoint = (category: EntanglementPoint["category"], point: number) => {
    setPoints((previous) => {
      const existing = previous.findIndex((item) => item.category === category && item.point === point);
      if (existing >= 0) return previous.filter((_, index) => index !== existing);
      return [...(previous.length === 3 ? previous.slice(1) : previous), { category, point }];
    });
    setDrawStart(phase);
    setDrawProgress(reducedMotion ? 1 : 0);
  };

  const currentNarrative = narrativeResult?.key === narrativeKey ? narrativeResult : null;
  const narrativeText = !selected
    ? (lang === "en" ? "Choose any three points." : "任意选择三个节点。")
    : currentNarrative?.status === "ready" && currentNarrative.text
      ? currentNarrative.text
      : currentNarrative?.status === "loading"
        ? (lang === "en" ? "Generating…" : "生成中…")
        : entanglementNarrative(selected, lang);

  return (
    <div ref={root} className="entanglement" onClick={(event) => event.stopPropagation()}>
      <div className="entanglement__top">
        <div className="entanglement__heading">
          <h3>Entanglement</h3>
          <span className="entanglement__formula" aria-hidden="true">
            <span>x(t) = x₀ + ∑ aᵢ cos(kᵢt + φᵢ)</span>
            <span>y(t) = y₀ + ∑ bᵢ sin(kᵢt + φᵢ)</span>
          </span>
        </div>
        <div className="entanglement__controls">
          <span>{points.length} / 3</span>
          {complete && <button type="button" className={`entanglement__toggle ${soundOn ? "is-on" : ""}`} onClick={toggleSound} aria-label={soundOn ? (lang === "en" ? "Mute form" : "关闭图形声音") : (lang === "en" ? "Hear form" : "聆听图形")} aria-pressed={soundOn} title={soundOn ? (lang === "en" ? "Mute" : "静音") : (lang === "en" ? "Listen" : "聆听")}>
            {soundOn ? <Volume2 aria-hidden /> : <VolumeX aria-hidden />}
          </button>}
          {!reducedMotion && <button type="button" className="entanglement__toggle" onClick={() => setPlaying((value) => !value)} aria-label={playing ? (lang === "en" ? "Pause rotation" : "暂停旋转") : (lang === "en" ? "Resume rotation" : "继续旋转")} aria-pressed={!playing}>
            {playing ? <svg viewBox="0 0 16 16" aria-hidden><path d="M5 3v10M11 3v10" /></svg> : <svg viewBox="0 0 16 16" aria-hidden><path d="m5 3 8 5-8 5Z" /></svg>}
          </button>}
        </div>
      </div>
      <div className="entanglement__circles" aria-label={lang === "en" ? "Choose any three points" : "任意选择三个节点"}>
        {categories.map((category, circle) => {
          const chosenPoints = points.filter((item) => item.category === category.id);
          const activePoint = chosenPoints.at(-1)?.point ?? 0;
          const chosen = chosenPoints.map(({ point }) => category.works[point]);
          const armAngle = -Math.PI / 2 + TAU * activePoint / category.works.length + category.frequency * circlePhases[circle];
          return (
          <div className="entanglement__circle-group" key={category.id}>
            <div
              className="entanglement__circle"
              style={{ "--ring-tone": category.color } as React.CSSProperties}
              onPointerEnter={() => { pointerOverCircle.current[circle] = true; }}
              onPointerLeave={() => {
                pointerOverCircle.current[circle] = false;
                focusWithinCircle.current[circle] = false;
              }}
              onFocusCapture={(event) => {
                focusWithinCircle.current[circle] = event.target instanceof HTMLElement && event.target.matches(":focus-visible");
              }}
              onBlurCapture={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) focusWithinCircle.current[circle] = false;
              }}
            >
              <span className="entanglement__circle-line" aria-hidden />
              <svg className="entanglement__arm" viewBox="0 0 100 100" aria-hidden><line x1="50" y1="50" x2={50 + 40 * Math.cos(armAngle)} y2={50 + 40 * Math.sin(armAngle)} /></svg>
              <span className="entanglement__circle-center" aria-hidden>{circle + 1}</span>
              {category.works.map((work, point) => {
                const angle = -Math.PI / 2 + TAU * point / category.works.length + category.frequency * circlePhases[circle];
                const position = { left: `${50 + 40 * Math.cos(angle)}%`, top: `${50 + 40 * Math.sin(angle)}%` };
                return (
                  <button
                    key={work.id}
                    type="button"
                    className={`entanglement__point ${chosenPoints.some((item) => item.point === point) ? "is-selected" : ""}`}
                    style={position}
                    aria-label={`${category.shortLabel}: ${work.title}`}
                    aria-pressed={chosenPoints.some((item) => item.point === point)}
                    title={work.title}
                    onClick={() => selectPoint(category.id, point)}
                  ><span>{point + 1}</span></button>
                );
              })}
            </div>
            <div className={`entanglement__circle-label ${chosen.length ? "is-filled" : ""}`}>
              <span>{category.shortLabel}</span>
              {chosen.length ? chosen.map((work) => (
                <div className="entanglement__selected-work" key={work.id}>
                  <strong title={work.title}>{work.title}</strong>
                  {work.creator && <small>{work.creator}</small>}
                  {work.href && <a className="entanglement__source" href={work.href} target="_blank" rel="noopener noreferrer" aria-label={lang === "en" ? `Open information about ${work.title} in a new window` : `在新窗口查看 ${work.title} 的资料`} title={lang === "en" ? "Open reference in a new window" : "在新窗口打开资料"}>+</a>}
                </div>
              )) : <strong>—</strong>}
            </div>
          </div>
        );})}
      </div>

      <div className="entanglement__output" aria-live="polite">
        <div className="entanglement__figure" aria-label={lang === "en" ? "Generated form" : "生成图形"}>
          <span className="entanglement__caption">FORM</span>
          <svg viewBox="0 0 500 232" role="img" aria-label={complete ? (lang === "en" ? "Form drawn from the selected points" : "由所选节点绘制的图形") : (lang === "en" ? "Waiting for three points" : "等待选择三个节点")}>
            <line x1="250" y1="0" x2="250" y2="232" className="entanglement__guide" />
            <line x1="0" y1="116" x2="500" y2="116" className="entanglement__guide" />
            {paths?.shape && <path d={paths.shape} className="entanglement__draw" />}
            {paths?.tip && drawProgress < 1 && <circle cx={paths.tip.x} cy={paths.tip.y} r="3" className="entanglement__tip" />}
          </svg>
        </div>
        <div className="entanglement__wave" aria-label={lang === "en" ? "Generated waveform" : "生成波形"}>
          <span className="entanglement__caption">WAVE</span>
          <svg viewBox="0 0 500 72" role="img" aria-label={complete ? (lang === "en" ? "Waveform from the selected points" : "由所选节点生成的波形") : (lang === "en" ? "Waiting for three points" : "等待选择三个节点")}>
            <line x1="0" y1="36" x2="500" y2="36" className="entanglement__guide" />
            {paths?.wave && <path d={paths.wave} className="entanglement__draw entanglement__draw--wave" />}
            {paths?.waveTip && drawProgress < 1 && <circle cx={paths.waveTip.x} cy={paths.waveTip.y} r="2.5" className="entanglement__tip entanglement__tip--wave" />}
          </svg>
        </div>
        <div className="entanglement__narrative">
          <span className="entanglement__caption">NARRATIVE</span>
          <p>{narrativeText}</p>
          {currentNarrative?.status === "error" && <small role="status">{lang === "en" ? "AI unavailable · local text" : "AI 暂不可用 · 显示本地文本"}</small>}
        </div>
      </div>
    </div>
  );
}
