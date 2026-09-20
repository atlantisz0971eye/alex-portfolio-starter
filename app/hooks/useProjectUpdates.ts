"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Theme } from "../types/project";

export function useProjectUpdates(themes: Theme[]) {
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  const [contentBySlug, setContentBySlug] = useState<Record<string, string | null>>({});

  const openProject = useMemo(
    () => themes.flatMap((theme) => theme.projects).find((project) => project.slug === openSlug),
    [openSlug, themes]
  );

  useEffect(() => {
    if (!openSlug || !openProject?.updatesTxt || contentBySlug[openSlug] !== undefined) return;

    const controller = new AbortController();
    fetch(openProject.updatesTxt, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(response.statusText);
        return response.text();
      })
      .then((text) => setContentBySlug((current) => ({ ...current, [openSlug]: text })))
      .catch((error) => {
        if ((error as Error).name !== "AbortError") {
          setContentBySlug((current) => ({ ...current, [openSlug]: "" }));
        }
      });

    return () => controller.abort();
  }, [contentBySlug, openProject, openSlug]);

  const toggle = useCallback((slug: string) => {
    setOpenSlug((current) => (current === slug ? null : slug));
  }, []);

  return { openSlug, contentBySlug, toggle };
}
