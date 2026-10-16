/**
 * A small bridge between the open mindstream and the rest of the app. The assistant applies changes on the
 * server, so the open panes must first save what they hold and afterwards reload what changed.
 */
type Flush = () => Promise<void>;

let current: string | null = null;
let flushers: Flush[] = [];

export const setCurrentMindstream = (id: string | null) => { current = id; };
export const currentMindstream = () => current;

export function registerFlush(flush: Flush) {
  flushers = [...flushers, flush];
  return () => { flushers = flushers.filter((item) => item !== flush); };
}

export async function flushMindstream() {
  await Promise.all(flushers.map((flush) => flush().catch(() => undefined)));
}

export const MINDSTREAM_CHANGED = "mindstream:changed";
export const notifyMindstreamChanged = (boardId: string) => window.dispatchEvent(new CustomEvent(MINDSTREAM_CHANGED, { detail: boardId }));
