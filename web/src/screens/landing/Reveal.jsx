import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "./motion.js";

/**
 * A landing section that fades and slides in the first time it scrolls into view (landing.css .landing-reveal).
 * With prefers-reduced-motion, or without IntersectionObserver, it is shown straight away.
 */
/** @param {any} props */
export default function Reveal({ as: Tag = "section", className = "", children, ...rest }) {
  const ref = useRef(null);
  const reduced = usePrefersReducedMotion();
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (reduced || !el || typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduced]);
  return (
    <Tag
      ref={ref}
      data-reveal={shown ? "shown" : "hidden"}
      className={`landing-reveal ${className}`}
      {...rest}
    >
      {children}
    </Tag>
  );
}
