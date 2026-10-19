"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkspaceBookmark } from "../lib/workspaceStore";

/** The saved places of one book. Changes are written after a short pause, and never before the saved list has loaded. */
export function useBookmarks(documentId: string, onError: (message: string) => void) {
  const [bookmarks, setBookmarks] = useState<WorkspaceBookmark[]>([]);
  const loaded = useRef(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    loaded.current = false;
    void fetch(`/api/workspace/bookmarks?id=${encodeURIComponent(documentId)}`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() as Promise<{ bookmarks: WorkspaceBookmark[] }> : null)
      .then((data) => { if (!cancelled && data) { setBookmarks(data.bookmarks); loaded.current = true; } })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [documentId]);

  const update = useCallback((change: (current: WorkspaceBookmark[]) => WorkspaceBookmark[]) => {
    setBookmarks((current) => {
      const next = change(current);
      window.clearTimeout(timer.current);
      if (loaded.current) {
        timer.current = window.setTimeout(() => {
          void fetch("/api/workspace/bookmarks", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: documentId, bookmarks: next }), keepalive: true })
            .then((response) => { if (!response.ok) onError("Could not save the bookmark."); })
            .catch(() => onError("Could not save the bookmark."));
        }, 400);
      }
      return next;
    });
  }, [documentId, onError]);

  return [bookmarks, update] as const;
}
