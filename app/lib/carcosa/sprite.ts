/**
 * Carcosa's two bodies, drawn in code so they can be tuned and animated. Every pixel is a palette letter.
 * The yak wears a tattered yellow cloak and a pale mask pushed up on its forehead (the King in Yellow); the dormant form
 * is the dried grey lump a slime mould turns into when it is left without food, with a yellow sign of three arcs pressed into it.
 */
export const W = 34;
export const H = 26;

export const PALETTE: Record<string, [number, number, number]> = {
  K: [24, 18, 14],      // outline
  B: [92, 64, 46],      // coat
  b: [122, 86, 62],     // coat, lit
  d: [66, 45, 33],      // coat, shade
  F: [201, 168, 126],   // shaggy skirt
  f: [168, 134, 96],    // skirt, shade
  W: [240, 231, 207],   // horn
  w: [205, 191, 156],   // horn, shade
  E: [11, 10, 9],       // eye
  e: [255, 255, 255],   // eye light
  N: [232, 180, 160],   // muzzle
  n: [176, 110, 104],   // nostril
  P: [226, 130, 130],   // cheek
  Y: [230, 194, 41],    // cloak
  y: [176, 140, 24],    // cloak, shade
  M: [232, 226, 212],   // mask
  m: [38, 30, 26],      // mask slits
  H: [40, 30, 24],      // hoof
  S: [255, 224, 90],    // sun
  G: [150, 150, 145],   // dried mould
  g: [110, 110, 106],   // dried mould, shade
  L: [190, 190, 184],   // dried mould, lit
};

type Grid = string[][];
const blank = (): Grid => Array.from({ length: H }, () => Array<string>(W).fill("."));
const put = (g: Grid, x: number, y: number, c: string) => { if (x >= 0 && x < W && y >= 0 && y < H) g[y][x] = c; };
const ellipse = (g: Grid, cx: number, cy: number, rx: number, ry: number, c: string | ((x: number, y: number) => string)) => {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y += 1) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x += 1) {
    if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) put(g, x, y, typeof c === "function" ? c(x, y) : c);
  }
};
const rect = (g: Grid, x0: number, y0: number, x1: number, y1: number, c: string) => { for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) put(g, x, y, c); };

/**
 * The yak: a big round head seen from the front on a small side-on body, which is what makes it look small and kind.
 * `frame` 0 or 1 moves the cloak's ragged tail; `blink` shuts the eyes.
 */
export function yak(frame: 0 | 1 = 0, blink = false, masked = false): string[] {
  const g = blank();
  // legs behind the skirt: short stubs with dark hooves
  for (const x of [4, 9, 14]) { rect(g, x, 22, x + 2, 24, "d"); rect(g, x, 24, x + 2, 25, "H"); }
  // body, lit on top
  ellipse(g, 10, 17, 9.5, 6, (x, y) => (y < 15 ? "b" : y > 19 ? "d" : "B"));
  // tail tuft
  ellipse(g, 0.8, 17, 1.4, 2.6, "B");
  // the cloak over the back: a ragged hem and a tail that flutters
  for (let x = 3; x <= 16; x += 1) {
    const hem = 15 + ((x * 3 + frame * 2) % 4);
    for (let y = 12 - (x < 6 ? 0 : 0); y <= hem; y += 1) put(g, x, y, y === hem || (x + y) % 6 === 0 ? "y" : "Y");
  }
  for (let i = 0; i < 9; i += 1) {
    const x = 3 - Math.floor(i / 2) - 0;
    const y = 12 + Math.round(Math.sin((i + frame * 2.2) / 1.7) * 1.3);
    put(g, x - 1, y, "Y"); put(g, x - 1, y + 1, i % 3 === 2 ? "." : "y");
  }
  // shaggy skirt: tufts of light fur along the bottom
  for (let x = 2; x <= 18; x += 1) {
    const hem = 21 + ((x * 5) % 3);
    for (let y = 19; y <= hem; y += 1) put(g, x, y, (x + y) % 3 === 0 ? "f" : "F");
  }
  // head, a big round one in front of the body
  ellipse(g, 24, 14, 7.2, 7, (x, y) => (y < 11 ? "b" : "B"));
  // fringe of dark hair over the forehead
  for (let x = 18; x <= 30; x += 1) { put(g, x, 10, "d"); if (x % 2 === 0) put(g, x, 11, "d"); }
  // horns: thick, curving out and then in, joined to the head
  const horn = (pts: [number, number][], inward: number) => pts.forEach(([x, y], i) => { const c = i > 4 ? "w" : "W"; put(g, x, y, c); put(g, x + inward, y, c); });
  horn([[20, 10], [19, 9], [18, 8], [17, 7], [17, 6], [17, 5], [18, 4]], 1);
  horn([[28, 10], [29, 9], [30, 8], [31, 7], [31, 6], [31, 5], [30, 4]], -1);
  // the pale mask, pushed up on the forehead (or pulled down over the eyes)
  if (!masked) {
    rect(g, 22, 5, 26, 5, "M"); rect(g, 22, 6, 26, 6, "M"); rect(g, 23, 7, 25, 7, "M");
    put(g, 23, 6, "m"); put(g, 25, 6, "m");
  }
  // eyes: big and dark with two lights, or shut
  const eye = (x: number) => {
    if (blink) { rect(g, x, 15, x + 2, 15, "E"); return; }
    rect(g, x, 13, x + 2, 16, "E"); put(g, x, 13, "e"); put(g, x + 2, 15, "e");
  };
  eye(19); eye(26);
  if (masked) {
    rect(g, 17, 12, 30, 17, "M"); rect(g, 18, 17, 29, 17, "M");
    rect(g, 20, 14, 22, 15, "m"); rect(g, 26, 14, 28, 15, "m");
  }
  // cheeks and muzzle
  put(g, 18, 18, "P"); put(g, 19, 18, "P"); put(g, 29, 18, "P"); put(g, 30, 18, "P");
  ellipse(g, 24.5, 19, 3.6, 2.4, "N");
  put(g, 23, 19, "n"); put(g, 26, 19, "n");
  // outline: every empty pixel that touches the figure
  const out = g.map((row) => row.slice());
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
    if (g[y][x] !== ".") continue;
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => (g[y + dy]?.[x + dx] ?? ".") !== ".")) out[y][x] = "K";
  }
  return out.map((row) => row.join(""));
}

/** The dried lump of a dormant slime mould: grey, with the one yellow thing on it a sign of three arcs. */
export function lump(): string[] {
  const g = blank();
  ellipse(g, 17, 17, 9, 5.5, (x, y) => (y < 15 ? "G" : y > 19 ? "g" : (x + y) % 5 === 0 ? "g" : "G"));
  ellipse(g, 14, 15, 3, 1.6, "L");
  // three arcs, each a small curve, set around a centre
  const arc = (cx: number, cy: number, quarter: number) => {
    const pts: [number, number][] = [[1, 0], [1, 1], [0, 2]];
    pts.forEach(([dx, dy]) => {
      const rot = [[dx, dy], [-dy, dx], [-dx, -dy], [dy, -dx]][quarter];
      put(g, cx + rot[0], cy + rot[1], "Y");
    });
  };
  arc(17, 17, 0); arc(17, 17, 1); arc(17, 17, 2);
  const out = g.map((row) => row.slice());
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
    if (g[y][x] !== ".") continue;
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => (g[y + dy]?.[x + dx] ?? ".") !== ".")) out[y][x] = "K";
  }
  return out.map((row) => row.join(""));
}

/** The pixels of a drawing as [x, y, colour] with colour from the palette. */
export function pixelsOf(rows: string[]) {
  const out: { x: number; y: number; rgb: [number, number, number] }[] = [];
  rows.forEach((row, y) => [...row].forEach((c, x) => { if (c !== "." && PALETTE[c]) out.push({ x, y, rgb: PALETTE[c] }); }));
  return out;
}
