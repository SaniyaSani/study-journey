import { useEffect, type RefObject } from "react";

/**
 * Writes the page scroll (clamped) into a CSS variable on an element so typography and
 * photography can drift a few pixels — slow and physical, never flashy.
 * Disabled for prefers-reduced-motion.
 */
export function useScrollDrift(ref: RefObject<HTMLElement | null>, max = 900): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const on = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() =>
        el.style.setProperty("--scroll", String(Math.min(max, window.scrollY))),
      );
    };
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", on);
    };
  }, [ref, max]);
}
