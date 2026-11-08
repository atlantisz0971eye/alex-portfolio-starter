"use client";

import { useCallback, useEffect, useState } from "react";

const INTRO_STORAGE_KEY = "introSeen";

export function useIntroOverlay() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      // ?scan opens alexsonicLAb on purpose, even after it has been seen.
      setIsOpen(params.has("scan") || (!localStorage.getItem(INTRO_STORAGE_KEY) && !window.location.hash && !params.has("focus")));
    } catch {
      setIsOpen(false);
    }
  }, []);

  const close = useCallback(() => {
    try {
      localStorage.setItem(INTRO_STORAGE_KEY, "1");
    } catch {
      // The overlay can still close when storage is unavailable.
    }
    setIsOpen(false);
  }, []);

  /** Open alexsonicLAb on purpose, from the header. */
  const open = useCallback(() => setIsOpen(true), []);

  return { isOpen, open, close };
}
