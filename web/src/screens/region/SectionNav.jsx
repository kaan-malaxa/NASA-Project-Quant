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
 * In-page navigation. Uses buttons + scrollIntoView, because the URL hash already holds the route.
 * Highlights the section currently in view and leaves out sections that are not on the page.
 *
 * sections:    [{ id, label }] in page order (default: the region story).
 * orientation: "horizontal" (a row of chips) or "vertical" (a numbered table of contents).
 * watch:       re-check which sections exist when this value changes (e.g. after data loads).
 */
export default function SectionNav({ sections = SECTIONS, orientation = "horizontal", label = "Sections", watch = undefined }) {
  const [active, setActive] = useState(sections[0]?.id);
  const [present, setPresent] = useState(sections);

  useEffect(() => {
    const found = sections.filter((s) => document.getElementById(s.id));
    // Before the page has rendered its sections (or in tests without them), keep the full list.
    setPresent(found.length ? found : sections);
    if (typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-20% 0px -70% 0px" },
    );
    for (const s of found) obs.observe(document.getElementById(s.id));
    return () => obs.disconnect();
  }, [sections, watch]);

  const go = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" });
    setActive(id);
  };

  const vertical = orientation === "vertical";
  return (
    <nav aria-label={label} className="py-1">
      <ul className={vertical ? "space-y-0.5" : "flex gap-1 overflow-x-auto [scrollbar-width:none]"}>
        {present.map((s, i) => {
          const on = active === s.id;
          return (
            <li key={s.id} className={vertical ? undefined : "shrink-0"}>
              <button
                type="button"
                onClick={() => go(s.id)}
                aria-current={on ? "true" : undefined}
                className={`rounded-md text-sm focus-visible:outline-2 focus-visible:outline-offset-2 ${
                  vertical ? "flex w-full items-baseline gap-2 px-3 py-1.5 text-left" : "px-3 py-1.5 whitespace-nowrap"
                } ${on ? "bg-muted text-foreground font-semibold" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
              >
                {vertical ? <span className="w-4 shrink-0 text-xs tabular-nums opacity-70">{i + 1}</span> : null}
                {s.label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
