export type Organized = { title: string; items: { text: string; parent: number | null }[] };

/** Lays an organized note out as a tree: a title card with the points fanned out to its right. */
export function layoutOrganized(result: Organized, x: number, y: number) {
  const depthOf = (index: number): number => { const parent = result.items[index].parent; return parent === null ? 1 : depthOf(parent) + 1; };
  const root = { id: crypto.randomUUID(), type: "text" as const, position: { x, y }, width: 260, height: 80, data: { text: result.title, tone: "sun" } };
  let cursor = y;
  const children = result.items.map((item, index) => {
    const height = Math.max(76, 52 + Math.ceil(item.text.length / 16) * 22);
    const node = { id: crypto.randomUUID(), type: "text" as const, position: { x: x + depthOf(index) * 300, y: cursor + 90 }, width: 260, height, data: { text: item.text, tone: "paper" } };
    cursor += height + 18;
    return node;
  });
  const edges = result.items.map((item, index) => ({ id: crypto.randomUUID(), source: item.parent === null ? root.id : children[item.parent].id, target: children[index].id }));
  return { root, children, edges };
}
