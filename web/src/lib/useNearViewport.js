import { useEffect, useState } from "react";

/**
 * True once the element has come within `margin` of the viewport (then stays true). Without IntersectionObserver
 * (old browsers, tests) it is true at once.
 */
export function useNearViewport(ref, margin = "300px") {
  const [near, setNear] = useState(false);
  useEffect(() => {
    if (near) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setNear(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin: `${margin} 0px` },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, margin, near]);
  return near;
}
