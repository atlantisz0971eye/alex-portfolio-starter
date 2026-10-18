"use client";

import { useCallback, useEffect, useState } from "react";

type IntroOverlayProps = {
  open: boolean;
  onClose: () => void;
};

/** Only Chromium can run an SVG filter on what is behind an element; other browsers get frosted glass with the oil film. */
const canLiquefy = () => typeof navigator !== "undefined" && /Chrome\//.test(navigator.userAgent) && typeof CSS !== "undefined" && CSS.supports("backdrop-filter", "blur(1px)");

/**
 * The welcome screen: a sheet of frosted, etched glass over the whole page, with a slow oil film moving on it.
 * Where the browser allows, the page behind is bent by a drifting noise field, like light through uneven liquid.
 */
export function IntroOverlay({ open, onClose }: IntroOverlayProps) {
  const [liquid, setLiquid] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const enter = useCallback(() => {
    if (leaving) return;
    setLeaving(true);
    window.setTimeout(onClose, 650);
  }, [leaving, onClose]);

  useEffect(() => {
    if (!open) return;
    setLiquid(canLiquefy());
    // The page behind stays still while the glass is up.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [open]);

  if (!open) return null;
  const still = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  return (
    <div
      className={`liquid-intro${leaving ? " is-leaving" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label="Alex Projects. Click to enter."
      tabIndex={0}
      onClick={enter}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          enter();
        }
      }}
      ref={(node) => node?.focus({ preventScroll: true })}
    >
      {liquid && (
        <svg className="liquid-defs" width="0" height="0" aria-hidden="true" focusable="false">
          <filter id="liquid-glass" colorInterpolationFilters="sRGB">
            <feTurbulence type="fractalNoise" baseFrequency="0.0045 0.007" numOctaves="2" seed="11" result="flow">
              {!still && <animate attributeName="baseFrequency" dur="38s" values="0.0045 0.007;0.0072 0.0048;0.0045 0.007" repeatCount="indefinite" />}
            </feTurbulence>
            <feDisplacementMap in="SourceGraphic" in2="flow" scale="64" xChannelSelector="R" yChannelSelector="G" result="dispR" />
            <feColorMatrix in="dispR" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="chanR" />
            <feDisplacementMap in="SourceGraphic" in2="flow" scale="76" xChannelSelector="R" yChannelSelector="G" result="dispG" />
            <feColorMatrix in="dispG" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="chanG" />
            <feDisplacementMap in="SourceGraphic" in2="flow" scale="88" xChannelSelector="R" yChannelSelector="G" result="dispB" />
            <feColorMatrix in="dispB" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="chanB" />
            <feBlend in="chanR" in2="chanG" mode="screen" result="rg" />
            <feBlend in="rg" in2="chanB" mode="screen" />
          </filter>
        </svg>
      )}
      <div className={`liquid-glass${liquid ? " is-liquid" : ""}`}>
        <div className="liquid-film" aria-hidden>
          <i /><i /><i /><i /><b />
        </div>
        <div className="liquid-grain" aria-hidden />
        <h1 className="liquid-title">
          <span>Alex</span> <span>Projects</span>
        </h1>
        <p className="liquid-hint" aria-hidden>Click to enter</p>
      </div>
    </div>
  );
}
