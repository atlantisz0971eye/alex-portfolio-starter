"use client";

import { useRef, useState } from "react";
import type { MediaKind, MediaGroups } from "../types/project";

const createInitialGroupIndex = () => ({ images: 0, video: 0, audio: 0 });

export function useMediaHub() {
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  const [kind, setKindState] = useState<MediaKind | null>(null);
  const [groupIndex, setGroupIndex] = useState(createInitialGroupIndex);
  const [itemIndex, setItemIndex] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stopAudio = () => {
    const node = audioRef.current;
    if (!node) return;
    node.pause();
    try {
      node.currentTime = 0;
    } catch {
      // ignore Safari reset failure
    }
  };

  const resetIndices = () => {
    setItemIndex(0);
    setGroupIndex(createInitialGroupIndex());
  };

  return {
    openSlug,
    kind,
    groupIndex,
    itemIndex,
    audioRef,
    open: (slug: string) => {
      stopAudio();
      setOpenSlug(slug);
      setKindState(null);
      resetIndices();
    },
    close: () => {
      stopAudio();
      setOpenSlug(null);
      setKindState(null);
      resetIndices();
    },
    setKind: (next: MediaKind | null) => {
      if (next !== "audio") stopAudio();
      setKindState(next);
      setItemIndex(0);
      if (next === "images" || next === "video" || next === "audio") {
        setGroupIndex((prev) => ({ ...prev, [next]: 0 }));
      }
    },
    selectGroup: (k: Exclude<MediaKind, "doc">, idx: number) => {
      if (k !== "audio") stopAudio();
      setGroupIndex((prev) => ({ ...prev, [k]: idx }));
      setItemIndex(0);
    },
    selectItem: (idx: number) => setItemIndex(idx),
    getTotals: (groups: MediaGroups) => ({
      images: groups.images?.reduce((total, g) => total + g.items.length, 0) ?? 0,
      video: groups.videos?.reduce((total, g) => total + g.items.length, 0) ?? 0,
      audio: groups.audios?.reduce((total, g) => total + g.items.length, 0) ?? 0,
    }),
  };
}
