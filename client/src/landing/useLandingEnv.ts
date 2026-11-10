import { useEffect, useState } from "react";

/** Under this width the landing page runs in "light mode" (no 3D, lighter motion). */
export const MOBILE_MAX_WIDTH = 767;

export type LandingEnv = {
  /** The visitor asked the OS for less motion: show final states, no animation. */
  reducedMotion: boolean;
  /** Narrow screen (under 768px): later prompts use this to skip heavy effects. */
  lightMode: boolean;
  /** The browser can create a WebGL context. */
  webgl: boolean;
  /** True when the 3D hero may run: WebGL works, motion is welcome and the screen is wide. */
  canRun3D: boolean;
};

function hasWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

/** Reduced-motion, mobile ("light mode") and WebGL checks for the landing page. */
export function useLandingEnv(): LandingEnv {
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const lightMode = useMediaQuery(`(max-width: ${MOBILE_MAX_WIDTH}px)`);
  const [webgl] = useState(hasWebGL);
  return { reducedMotion, lightMode, webgl, canRun3D: webgl && !reducedMotion && !lightMode };
}
