"use client";

import { createContext } from "react";

export type TextData = { text: string; tone: string };

export type BoardContextValue = {
  boardId: string;
  touch: boolean;
  /** Changes a sticky card. */
  update: (id: string, data: Partial<TextData>) => void;
  /** Changes any field of a block or container. */
  patch: (id: string, data: Record<string, unknown>) => void;
  edit: (id: string) => void;
  read: (id: string) => void;
};

export const BoardContext = createContext<BoardContextValue>({ boardId: "", touch: false, update: () => undefined, patch: () => undefined, edit: () => undefined, read: () => undefined });
