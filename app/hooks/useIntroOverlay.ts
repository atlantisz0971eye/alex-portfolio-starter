"use client";

import { useCallback, useEffect, useState } from "react";

const INTRO_STORAGE_KEY = "introSeen";

export function useIntroOverlay() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    try {
      setIsOpen(!localStorage.getItem(INTRO_STORAGE_KEY));
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

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [close, isOpen]);

  return { isOpen, close };
}
