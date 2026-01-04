import { DependencyList, RefObject, useEffect, useLayoutEffect, useState } from "react";

export function useComponentWidthOf(ref: RefObject<HTMLElement | null>) {
  const [parentWidth, setParentWidth] = useState(0);

  useEffect(() => {
    if (!ref.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setParentWidth(entry.contentRect.width);
      }
    });

    resizeObserver.observe(ref.current);
    return () => resizeObserver.disconnect();
  }, [ref]);

  return parentWidth;
}

/**
 * Scrolls an element to the end (right) after dependencies change.
 * Waits for the next frame to ensure layout changes are reflected in scrollWidth.
 */
export function useScrollToEnd(ref: RefObject<HTMLElement | null>, deps: DependencyList) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const raf = requestAnimationFrame(() => {
      el.scrollLeft = el.scrollWidth;
    });

    return () => cancelAnimationFrame(raf);
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
}


