"use client";

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { errors } from "./api";
import { isTranslatable, type Block } from "./readerText";

type Input = {
  enabled: boolean;
  documentId: string;
  blocks: Block[];
  /** Offset the reader is at, so paragraphs ahead are translated first. */
  offsetRef: MutableRefObject<number>;
  /** The first paragraphs of the next section, if it is already loaded. */
  nextBlocks: () => Block[];
};

const BATCH_BLOCKS = 5;
const BATCH_CHARS = 5500;

async function post(body: Record<string, unknown>) {
  const response = await fetch("/api/workspace/translate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({})) as { translations?: Record<string, string>; missing?: number[]; error?: string };
  if (!response.ok) throw new Error(errors[data.error ?? ""] ?? "Translation failed. Try again.");
  return data;
}

/**
 * Keeps Chinese translations for the paragraphs being read. Saved translations load first; the rest are
 * translated in small batches starting at the reader's position, then a few paragraphs of the next section.
 */
export function useTranslations({ enabled, documentId, blocks, offsetRef, nextBlocks }: Input) {
  const [translations, setTranslations] = useState<Record<number, string>>({});
  const [queued, setQueued] = useState<Set<number>>(new Set());
  const [status, setStatus] = useState<"idle" | "working" | "error">("idle");
  const [message, setMessage] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [version, setVersion] = useState(0);
  const have = useRef<Record<number, string>>({});
  const nextBlocksRef = useRef(nextBlocks);
  nextBlocksRef.current = nextBlocks;

  useEffect(() => {
    if (!enabled) { setStatus("idle"); setQueued(new Set()); return; }
    let cancelled = false;

    const merge = (found: Record<string, string>) => {
      const next: Record<number, string> = {};
      for (const [offset, text] of Object.entries(found)) if (text && have.current[Number(offset)] !== text) next[Number(offset)] = text;
      if (!Object.keys(next).length) return;
      have.current = { ...have.current, ...next };
      setTranslations(have.current);
      setVersion((value) => value + 1);
    };

    const loadCached = async (list: Block[]) => {
      const fresh = list.filter((block) => !have.current[block.offset]);
      for (let start = 0; start < fresh.length && !cancelled; start += 100) {
        const data = await post({ documentId, mode: "cache", blocks: fresh.slice(start, start + 100).map((block) => ({ offset: block.offset, text: block.text })) });
        if (!cancelled) merge(data.translations ?? {});
      }
    };

    const translateList = async (list: Block[], track: boolean) => {
      const tries = new Map<number, number>();
      let remaining = list.filter((block) => !have.current[block.offset]);
      if (track && !cancelled) setQueued(new Set(remaining.map((block) => block.offset)));
      while (remaining.length && !cancelled) {
        // Ahead of the reader first, then earlier paragraphs.
        const here = offsetRef.current;
        const ordered = [...remaining.filter((block) => block.offset >= here), ...remaining.filter((block) => block.offset < here).reverse()];
        const batch: Block[] = [];
        let chars = 0;
        for (const block of ordered) {
          if (batch.length && (batch.length >= BATCH_BLOCKS || chars + block.text.length > BATCH_CHARS)) break;
          batch.push(block);
          chars += block.text.length;
        }
        const data = await post({ documentId, mode: "translate", blocks: batch.map((block) => ({ offset: block.offset, text: block.text })) });
        if (cancelled) return;
        merge(data.translations ?? {});
        // A paragraph the model skipped is tried once more in a later batch, then given up on.
        for (const block of batch) if (!have.current[block.offset]) tries.set(block.offset, (tries.get(block.offset) ?? 0) + 1);
        remaining = remaining.filter((block) => !have.current[block.offset] && (tries.get(block.offset) ?? 0) < 2);
        if (track) setQueued(new Set(remaining.map((block) => block.offset)));
      }
    };

    (async () => {
      const targets = blocks.filter(isTranslatable);
      if (!targets.length) { setStatus("idle"); return; }
      setStatus("working");
      setMessage("");
      try {
        await loadCached(targets);
        await translateList(targets, true);
        const upcoming = nextBlocksRef.current().filter(isTranslatable).slice(0, 12);
        if (upcoming.length && !cancelled) { await loadCached(upcoming); await translateList(upcoming, false); }
        if (!cancelled) { setStatus("idle"); setQueued(new Set()); }
      } catch (cause) {
        if (!cancelled) { setStatus("error"); setMessage(cause instanceof Error ? cause.message : "Translation failed."); setQueued(new Set()); }
      }
    })();
    return () => { cancelled = true; };
  }, [enabled, documentId, blocks, attempt, offsetRef]);

  /** Translates one paragraph again, ignoring the saved translation. */
  const redo = useCallback(async (block: Block) => {
    const data = await post({ documentId, mode: "translate", force: true, blocks: [{ offset: block.offset, text: block.text }] });
    const text = data.translations?.[String(block.offset)];
    if (text) { have.current = { ...have.current, [block.offset]: text }; setTranslations(have.current); setVersion((value) => value + 1); }
    else throw new Error("Could not translate that paragraph again.");
  }, [documentId]);

  const total = blocks.filter(isTranslatable).length;
  const done = blocks.filter((block) => isTranslatable(block) && translations[block.offset]).length;
  return { translations, queued, status, message, version, done, total, retry: () => setAttempt((value) => value + 1), redo };
}
