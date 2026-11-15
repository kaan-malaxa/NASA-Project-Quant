import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { GLOSSARY } from "@/lib/glossary.js";
import { INSTRUMENTS } from "./satellites.js";

/**
 * Info panel for one satellite: a side panel on wide screens (on the side the satellite was clicked), a bottom sheet
 * on phones. Closes with the X button, Escape, or a press outside it.
 * `role` comes from calibration.json (satelliteRole); when it is null the role block is left out.
 */
export default function SatellitePanel({ sat, role, side = "right", onClose }) {
  const ref = useRef(null);
  const closeRef = useRef(null);
  const instrument = INSTRUMENTS[sat.instrument];

  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
  }, [sat.id]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose("escape");
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose("outside");
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [onClose]);

  return (
    <aside
      ref={ref}
      role="dialog"
      aria-labelledby="satellite-panel-title"
      data-side={side}
      className={`satellite-panel bg-card text-card-foreground pointer-events-auto fixed inset-x-0 bottom-0 z-40 max-h-[70svh] space-y-3 overflow-y-auto rounded-t-2xl border p-5 shadow-2xl sm:absolute sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:max-h-[80%] sm:w-80 sm:-translate-y-1/2 sm:rounded-xl ${side === "left" ? "sm:left-6" : "sm:right-6"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="satellite-panel-title" className="text-xl font-semibold tracking-tight">
            {sat.name}
          </h2>
          <p className="text-muted-foreground text-sm">Instrument: {instrument.label}</p>
        </div>
        <button
          ref={closeRef}
          type="button"
          aria-label={`Close ${sat.name} details`}
          onClick={() => onClose("button")}
          className="hover:bg-accent -mt-1 -mr-1 rounded-md p-2 focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <X aria-hidden="true" className="size-5" />
        </button>
      </div>
      <p className="text-sm text-pretty">{sat.about}</p>
      <dl className="space-y-3 text-sm">
        <div>
          <dt className="font-medium">{instrument.label}</dt>
          <dd className="text-muted-foreground text-pretty">{GLOSSARY[instrument.glossary].text}</dd>
          <dd className="text-pretty">{instrument.pixel}</dd>
        </div>
        {role ? (
          <div data-testid="satellite-role">
            <dt className="font-medium">Role in our record: {role.title}</dt>
            {role.lines.map((line) => (
              <dd key={line} className="text-muted-foreground text-pretty">
                {line}
              </dd>
            ))}
          </div>
        ) : null}
      </dl>
    </aside>
  );
}
