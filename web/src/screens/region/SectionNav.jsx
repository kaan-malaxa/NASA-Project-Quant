import { useEffect, useState } from "react";

export const SECTIONS = [
  { id: "verdict", label: "Verdict" },
  { id: "calendar", label: "Calendar" },
  { id: "critical-weeks", label: "Critical weeks" },
  { id: "this-week", label: "This week" },
  { id: "where", label: "Where" },
  { id: "downloads", label: "Downloads" },
];

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Sticky in-page navigation. Uses buttons + scrollIntoView, because the URL hash already holds the route.
 * Highlights the section currently in view.
 */
export default function SectionNav() {
  const [active, setActive] = useState(SECTIONS[0].id);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-20% 0px -70% 0px" },
    );
    for (const s of SECTIONS) {
      const el = document.getElementById(s.id);
      if (el) obs.observe(el);
    }
    return () => obs.disconnect();
  }, []);

  const go = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" });
    setActive(id);
  };

  return (
    <nav aria-label="Sections" className="py-1">
      <ul className="flex gap-1 overflow-x-auto [scrollbar-width:none]">
        {SECTIONS.map((s) => (
          <li key={s.id} className="shrink-0">
            <button
              type="button"
              onClick={() => go(s.id)}
              aria-current={active === s.id ? "true" : undefined}
              className={`rounded-md px-3 py-1.5 text-sm whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 ${
                active === s.id ? "bg-muted font-semibold underline underline-offset-4" : "hover:bg-muted"
              }`}
            >
              {s.label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
