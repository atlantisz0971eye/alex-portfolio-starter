export type TiltElement = HTMLDivElement & {
  _raf?: number;
  _nx?: number;
  _ny?: number;
  _rx?: number;
  _ry?: number;
  _leaving?: boolean;
};

const PERSPECTIVE = 800;
const TRANSLATE_Z = 14;

export function updateTilt(element: TiltElement, clientX: number, clientY: number) {
  const rect = element.getBoundingClientRect();
  element._nx = (clientX - rect.left) / rect.width - 0.5;
  element._ny = (clientY - rect.top) / rect.height - 0.5;
  element._leaving = false;

  if (!element._raf) {
    element._rx = element._rx ?? 0;
    element._ry = element._ry ?? 0;

    const step = () => {
      const targetX = (-(element._ny ?? 0)) * 12;
      const targetY = (element._nx ?? 0) * 12;
      element._rx! += (targetX - element._rx!) * 0.18;
      element._ry! += (targetY - element._ry!) * 0.18;
      element.style.transform = `perspective(${PERSPECTIVE}px) rotateX(${element._rx!.toFixed(2)}deg) rotateY(${element._ry!.toFixed(2)}deg) translateZ(${TRANSLATE_Z}px) scale(var(--scale, 1.015))`;

      if (element._leaving && Math.abs(element._rx!) + Math.abs(element._ry!) < 0.06) {
        cancelAnimationFrame(element._raf!);
        element._raf = undefined;
        element._rx = 0;
        element._ry = 0;
        element.style.transform = `perspective(${PERSPECTIVE}px) translateZ(${TRANSLATE_Z}px) scale(var(--scale, 1.015))`;
        return;
      }

      element._raf = requestAnimationFrame(step);
    };

    element._raf = requestAnimationFrame(step);
  }

  element.style.setProperty("--gx", `${(((clientX - rect.left) / rect.width) * 100).toFixed(2)}%`);
  element.style.setProperty("--gy", `${(((clientY - rect.top) / rect.height) * 100).toFixed(2)}%`);
  const glare = element.querySelector<HTMLElement>("[data-glare]");
  if (glare) glare.style.opacity = "0.22";
}

export function resetTilt(element: TiltElement) {
  element.style.setProperty("--scale", "1.015");
  element._leaving = true;
  element._nx = 0;
  element._ny = 0;
  const glare = element.querySelector<HTMLElement>("[data-glare]");
  if (glare) glare.style.opacity = "0";
}

export function cancelTiltAnimation(element: TiltElement | null) {
  if (!element?._raf) return;
  cancelAnimationFrame(element._raf);
  element._raf = undefined;
}
