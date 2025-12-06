"use client";

"use client";

import type React from "react";
import { useEffect, useRef, useState } from "react";

type UseThemeVideosParams = {
  allowTechnologyVideo: boolean;
  allowRuminationVideo: boolean;
  allowConnectionVideo: boolean;
  mediaHubOpenSlug: string | null;
  searchOpen: boolean;
};

export type ThemeVideoEntry = {
  ref: React.RefObject<HTMLVideoElement>;
  ready: boolean;
  error: string | null;
  path: string;
  poster: string;
  show: boolean;
  onLoaded: () => void;
  onError: (e: React.SyntheticEvent<HTMLVideoElement, Event>) => void;
};
export type ThemeVideos = {
  technology: ThemeVideoEntry;
  rumination: ThemeVideoEntry;
  connection: ThemeVideoEntry;
};

const TECH_VIDEO_PATH = "/AfterEffect_intro.mp4";
const RUM_VIDEO_PATH = "/Rumantion_close.mp4";
const CONNECTION_VIDEO_PATH = "/Connection-bg.mp4";

export function useThemeVideos({
  allowTechnologyVideo,
  allowRuminationVideo,
  allowConnectionVideo,
  mediaHubOpenSlug,
  searchOpen,
}: UseThemeVideosParams) {
  const technologyVideoRef = useRef<HTMLVideoElement>(null!);
  const ruminationVideoRef = useRef<HTMLVideoElement>(null!);
  const connectionVideoRef = useRef<HTMLVideoElement>(null!);

  const [technologyVideoReady, setTechnologyVideoReady] = useState(false);
  const [technologyVideoError, setTechnologyVideoError] = useState<string | null>(null);
  const [ruminationVideoReady, setRuminationVideoReady] = useState(false);
  const [ruminationVideoError, setRuminationVideoError] = useState<string | null>(null);
  const [connectionVideoReady, setConnectionVideoReady] = useState(false);
  const [connectionVideoError, setConnectionVideoError] = useState<string | null>(null);

  useEffect(() => {
    const videos: HTMLVideoElement[] = [];
    if (allowTechnologyVideo && technologyVideoRef.current) videos.push(technologyVideoRef.current);
    if (allowRuminationVideo && ruminationVideoRef.current) videos.push(ruminationVideoRef.current);
    if (allowConnectionVideo && connectionVideoRef.current) videos.push(connectionVideoRef.current);
    if (videos.length === 0) return;

    const timers = new WeakMap<HTMLVideoElement, number>();
    const clearTimer = (el: HTMLVideoElement) => {
      const prev = timers.get(el);
      if (prev) {
        window.clearTimeout(prev);
        timers.delete(el);
      }
    };

    const setState = (el: HTMLVideoElement, playing: boolean) => {
      el.dataset.state = playing ? "playing" : "paused";
    };

    const tryPause = (el: HTMLVideoElement) => {
      el.pause();
      setState(el, false);
    };

    const tryPlay = (el: HTMLVideoElement) => {
      if (document.hidden || Boolean(mediaHubOpenSlug) || searchOpen) {
        tryPause(el);
        return;
      }
      el
        .play()
        .then(() => setState(el, true))
        .catch(() => {
          setState(el, false);
        });
    };

    const schedule = (el: HTMLVideoElement, fn: () => void) => {
      clearTimer(el);
      const id = window.setTimeout(() => {
        fn();
        timers.delete(el);
      }, 100);
      timers.set(el, id);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const el = entry.target as HTMLVideoElement;
          if (entry.isIntersecting && entry.intersectionRatio >= 0.25) {
            schedule(el, () => tryPlay(el));
          } else {
            schedule(el, () => tryPause(el));
          }
        });
      },
      { threshold: [0, 0.25, 0.5, 1] }
    );

    videos.forEach((el) => observer.observe(el));

    const recheckVisibility = () => {
      videos.forEach((el) => {
        if (document.hidden || Boolean(mediaHubOpenSlug) || searchOpen) {
          tryPause(el);
          return;
        }
        const rect = el.getBoundingClientRect();
        const vh = window.innerHeight || document.documentElement.clientHeight || 0;
        const inView = rect.top < vh * 0.75 && rect.bottom > vh * 0.25;
        if (inView) {
          schedule(el, () => tryPlay(el));
        } else {
          schedule(el, () => tryPause(el));
        }
      });
    };

    document.addEventListener("visibilitychange", recheckVisibility);
    recheckVisibility();

    return () => {
      document.removeEventListener("visibilitychange", recheckVisibility);
      observer.disconnect();
      videos.forEach((el) => {
        clearTimer(el);
        tryPause(el);
      });
    };
  }, [allowTechnologyVideo, allowRuminationVideo, allowConnectionVideo, mediaHubOpenSlug, searchOpen]);

  const technology: ThemeVideoEntry = {
    ref: technologyVideoRef,
    ready: technologyVideoReady,
    error: technologyVideoError,
    path: TECH_VIDEO_PATH,
    poster: "/Dys_Utopia_bg.png",
    show: allowTechnologyVideo,
    onLoaded: () => {
      console.debug("[video] Technology ready:", TECH_VIDEO_PATH);
      setTechnologyVideoReady(true);
      setTechnologyVideoError(null);
    },
    onError: (e) => {
      console.error("[video] Technology error", {
        src: e.currentTarget.currentSrc,
        networkState: e.currentTarget.networkState,
      });
      setTechnologyVideoError("Technology video failed to load");
      setTechnologyVideoReady(false);
    },
  };

  const rumination: ThemeVideoEntry = {
    ref: ruminationVideoRef,
    ready: ruminationVideoReady,
    error: ruminationVideoError,
    path: RUM_VIDEO_PATH,
    poster: "/Dys_Utopia_bg.png",
    show: allowRuminationVideo,
    onLoaded: () => {
      console.debug("[video] Rumination ready:", RUM_VIDEO_PATH);
      setRuminationVideoReady(true);
      setRuminationVideoError(null);
    },
    onError: (e) => {
      console.error("[video] Rumination error", {
        src: e.currentTarget.currentSrc,
        networkState: e.currentTarget.networkState,
      });
      setRuminationVideoError("Rumination video failed to load");
      setRuminationVideoReady(false);
    },
  };

  const connection: ThemeVideoEntry = {
    ref: connectionVideoRef,
    ready: connectionVideoReady,
    error: connectionVideoError,
    path: CONNECTION_VIDEO_PATH,
    poster: "/bg-roots.jpg",
    show: allowConnectionVideo,
    onLoaded: () => {
      console.debug("[video] Connection ready:", CONNECTION_VIDEO_PATH);
      setConnectionVideoReady(true);
      setConnectionVideoError(null);
    },
    onError: (e) => {
      console.error("[video] Connection error", {
        src: e.currentTarget.currentSrc,
        networkState: e.currentTarget.networkState,
      });
      setConnectionVideoError("Connection video failed to load");
      setConnectionVideoReady(false);
    },
  };

  const videos: ThemeVideos = {
    technology,
    rumination,
    connection,
  };
  return videos;
}
