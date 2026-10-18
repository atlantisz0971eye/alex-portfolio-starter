"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

type IntroOverlayProps = {
  open: boolean;
  onClose: () => void;
};

type LensMap = { url: string; scale: number; width: number; height: number };

/**
 * Builds the displacement map for a convex lens: the middle of the pane is magnified a little, and a bevel around the
 * edge bends the picture behind it, so the page seems to sit under a thick sheet of glass.
 * Red and green hold the horizontal and vertical shift (0.5 = no shift), scaled by `scale` pixels.
 */
function buildLensMap(width: number, height: number, radius: number): LensMap | null {
  const mw = Math.max(64, Math.min(640, Math.round(width / 3)));
  const mh = Math.max(64, Math.min(640, Math.round(height / 3)));
  const canvas = document.createElement("canvas");
  canvas.width = mw;
  canvas.height = mh;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const image = context.createImageData(mw, mh);
  const halfW = width / 2;
  const halfH = height / 2;
  const bevel = Math.min(120, Math.min(width, height) * 0.16);
  const shifts = new Float32Array(mw * mh * 2);
  let strongest = 1;
  for (let j = 0; j < mh; j += 1) {
    for (let i = 0; i < mw; i += 1) {
      const dx = ((i + 0.5) / mw) * width - halfW;
      const dy = ((j + 0.5) / mh) * height - halfH;
      const r = Math.min(1, Math.hypot(dx / halfW, dy / halfH) / 1.1);
      const bulge = 0.12 * (1 - r * r);
      // Distance to the pane's rounded edge (positive inside).
      const qx = Math.abs(dx) - (halfW - radius);
      const qy = Math.abs(dy) - (halfH - radius);
      const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
      const inside = Math.min(Math.max(qx, qy), 0);
      const depth = -(outside + inside - radius);
      const edge = Math.max(0, 1 - depth / bevel);
      const push = edge * edge * bevel * 0.3;
      const length = Math.hypot(dx, dy) || 1;
      const sx = -dx * bulge + (dx / length) * push;
      const sy = -dy * bulge + (dy / length) * push;
      const at = (j * mw + i) * 2;
      shifts[at] = sx;
      shifts[at + 1] = sy;
      strongest = Math.max(strongest, Math.abs(sx), Math.abs(sy));
    }
  }
  const scale = Math.ceil(strongest * 2) + 2;
  for (let k = 0; k < mw * mh; k += 1) {
    image.data[k * 4] = Math.round((0.5 + shifts[k * 2] / scale) * 255);
    image.data[k * 4 + 1] = Math.round((0.5 + shifts[k * 2 + 1] / scale) * 255);
    image.data[k * 4 + 2] = 128;
    image.data[k * 4 + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  return { url: canvas.toDataURL("image/png"), scale, width, height };
}

/** Only Chromium can run an SVG filter on what is behind an element; other browsers get a plain frosted pane. */
const canRefract = () => typeof navigator !== "undefined" && /Chrome\//.test(navigator.userAgent) && typeof CSS !== "undefined" && CSS.supports("backdrop-filter", "blur(1px)");

export function IntroOverlay({ open, onClose }: IntroOverlayProps) {
  const paneRef = useRef<HTMLDivElement | null>(null);
  const [map, setMap] = useState<LensMap | null>(null);
  const [refracts, setRefracts] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const enter = useCallback(() => {
    if (leaving) return;
    setLeaving(true);
    window.setTimeout(onClose, 520);
  }, [leaving, onClose]);

  useLayoutEffect(() => {
    if (!open) return;
    setRefracts(canRefract());
    const pane = paneRef.current;
    if (!pane) return;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const { width, height } = pane.getBoundingClientRect();
        if (width < 40 || height < 40) return;
        const radius = Number.parseFloat(getComputedStyle(pane).borderTopLeftRadius) || 32;
        setMap(buildLensMap(Math.round(width), Math.round(height), radius));
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(pane);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [open]);

  // The page behind stays still while the glass is up.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className={`lens-intro${leaving ? " is-leaving" : ""}`}
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
      {refracts && map && (
        <svg className="lens-defs" width="0" height="0" aria-hidden="true" focusable="false">
          <filter id="lens-refract" x="0" y="0" width={map.width} height={map.height} filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
            <feImage href={map.url} x="0" y="0" width={map.width} height={map.height} preserveAspectRatio="none" result="map" />
            <feDisplacementMap in="SourceGraphic" in2="map" scale={map.scale * 0.985} xChannelSelector="R" yChannelSelector="G" result="dispR" />
            <feColorMatrix in="dispR" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="chanR" />
            <feDisplacementMap in="SourceGraphic" in2="map" scale={map.scale} xChannelSelector="R" yChannelSelector="G" result="dispG" />
            <feColorMatrix in="dispG" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="chanG" />
            <feDisplacementMap in="SourceGraphic" in2="map" scale={map.scale * 1.015} xChannelSelector="R" yChannelSelector="G" result="dispB" />
            <feColorMatrix in="dispB" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="chanB" />
            <feBlend in="chanR" in2="chanG" mode="screen" result="rg" />
            <feBlend in="rg" in2="chanB" mode="screen" />
          </filter>
        </svg>
      )}
      <div ref={paneRef} className={`lens-pane${refracts && map ? " is-refracting" : ""}`}>
        <div className="lens-pane__sheen" aria-hidden />
        <div className="lens-pane__rim" aria-hidden />
        <h1 className="lens-title">
          <span>Alex</span> <span>Projects</span>
        </h1>
        <p className="lens-hint" aria-hidden>Click to enter</p>
      </div>
    </div>
  );
}
