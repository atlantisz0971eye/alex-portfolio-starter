"use client";

import { useEffect, useRef } from "react";
import { isTouchDevice, prefersReducedMotion } from "../utils/environment";

/**
 * The Live works background: a phosphor dot matrix whose dots brighten and fade with a slow, domain-warped
 * noise, like the afterglow of a screen still running. A faint refresh band rolls down it now and then.
 * It takes the colour of the work being looked at. One small WebGL shader drawn at half resolution and a
 * capped frame rate, only while the section is on screen and the tab is visible.
 */

type Rgb = [number, number, number];

const VERTEX = `
attribute vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }
`;

const FRAGMENT = `
precision mediump float;
uniform vec2 res;
uniform float time;
uniform vec3 tint;
uniform float cell;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.03 + 11.7; a *= 0.5; }
  return v;
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 id = floor(frag / cell);
  vec2 local = fract(frag / cell) - 0.5;
  vec2 q = id * 0.075;
  float t = time * 0.035;
  // Domain warp: the field folds over itself slowly, never repeating the same shape.
  vec2 warp = vec2(fbm(q + vec2(t, -t * 0.7)), fbm(q + vec2(-t * 0.6, t) + 5.2));
  float n = fbm(q + warp * 1.8 + vec2(t * 0.4, 0.0));
  float level = smoothstep(0.42, 0.82, n);
  // A refresh band rolls down the screen every half minute or so.
  float y = 1.0 - frag.y / res.y;
  float band = exp(-pow((y - fract(time * 0.032)) * 9.0, 2.0)) * 0.35;
  float glow = clamp(level + band * (0.3 + level), 0.0, 1.0);
  float radius = mix(0.1, 0.36, glow);
  float dotMask = smoothstep(radius, radius - 0.14, length(local));
  float alpha = dotMask * (0.05 + glow * 0.5);
  gl_FragColor = vec4(tint * alpha, alpha);
}
`;

const SCALE = 0.5; // drawn at half resolution and scaled up by CSS, which also softens the dots into a glow
const CELL_CSS = 12; // distance between dots, in CSS pixels

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
}

export function DevelopmentSignal({ tint }: { tint: Rgb }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const target = useRef<Rgb>(tint);
  target.current = tint;

  useEffect(() => {
    const canvas = canvasRef.current;
    const section = canvas?.parentElement;
    const gl = canvas?.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false, powerPreference: "low-power" });
    if (!canvas || !section || !gl) return; // without WebGL the section keeps its plain CSS background

    const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
    const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
    const program = gl.createProgram();
    if (!vertex || !fragment || !program) return;
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    gl.useProgram(program);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW); // one triangle covers the screen
    const position = gl.getAttribLocation(program, "p");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    const uRes = gl.getUniformLocation(program, "res");
    const uTime = gl.getUniformLocation(program, "time");
    const uTint = gl.getUniformLocation(program, "tint");
    const uCell = gl.getUniformLocation(program, "cell");

    const frameGap = 1000 / (isTouchDevice ? 12 : 20);
    const start = performance.now() - Math.random() * 60_000; // each visit starts somewhere else in the field
    const colour: Rgb = [...target.current];
    let visible = false;
    let frame = 0;
    let last = 0;

    const resize = () => {
      const box = section.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(box.width * SCALE));
      canvas.height = Math.max(1, Math.round(box.height * SCALE));
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uCell, CELL_CSS * SCALE);
    };

    const draw = (now: number) => {
      // Ease towards the colour of the work being looked at, over about a second.
      for (let i = 0; i < 3; i += 1) colour[i] += (target.current[i] - colour[i]) * 0.08;
      gl.uniform3f(uTint, colour[0] / 255, colour[1] / 255, colour[2] / 255);
      gl.uniform1f(uTime, (now - start) / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const tick = (now: number) => {
      frame = 0;
      if (!visible || document.hidden) return;
      if (now - last >= frameGap) {
        last = now;
        draw(now);
      }
      frame = requestAnimationFrame(tick);
    };
    const run = () => {
      if (frame || !visible || document.hidden) return;
      frame = requestAnimationFrame(tick);
    };

    resize();
    draw(performance.now());

    // Reduced motion: one still frame, redrawn only when the colour or the size changes.
    const still = () => {
      Object.assign(colour, target.current);
      draw(start + 20_000);
    };

    const onScreen = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (prefersReducedMotion) still();
      else if (visible) run();
    }, { threshold: 0.05 });
    onScreen.observe(section);

    let pending = 0;
    const resized = new ResizeObserver(() => {
      cancelAnimationFrame(pending);
      pending = requestAnimationFrame(() => {
        resize();
        if (prefersReducedMotion) still();
        else draw(performance.now());
      });
    });
    resized.observe(section);

    const onVisibility = () => run();
    document.addEventListener("visibilitychange", onVisibility);
    const onTint = () => prefersReducedMotion && still();
    canvas.addEventListener("tint", onTint);

    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(pending);
      onScreen.disconnect();
      resized.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("tint", onTint);
    };
  }, []);

  // With reduced motion there is no loop to pick the new colour up, so tell the still frame to redraw.
  useEffect(() => {
    canvasRef.current?.dispatchEvent(new Event("tint"));
  }, [tint]);

  return <canvas ref={canvasRef} className="dev-signal" aria-hidden />;
}
