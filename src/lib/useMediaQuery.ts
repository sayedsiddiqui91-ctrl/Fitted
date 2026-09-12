"use client";

import { useEffect, useState } from "react";

/** True while the media query matches. Starts `false` on the server and on the first client render,
    then settles after mount — so it never causes a hydration mismatch. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    setMatches(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

/** The `lg` breakpoint, where the editor shows the form and the preview side by side. */
export function useIsDesktop(): boolean {
  return useMediaQuery("(min-width: 1024px)");
}
