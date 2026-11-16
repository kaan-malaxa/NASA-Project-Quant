import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import LoadingFrame from "@/components/LoadingFrame.jsx";
import SectionState from "@/components/SectionState.jsx";
import { useRegions } from "@/data/useRegions.js";
import { useJson } from "@/data/useJson.js";
import { regionFilePath } from "@/data/files.js";
import { useOutlineThumb } from "@/data/outlineThumbs.js";
import { useNearViewport } from "@/lib/useNearViewport.js";
import { statusLabel } from "@/lib/labels.js";
import { useDocumentMeta } from "@/lib/useDocumentMeta.js";
import CountryBrowser from "./CountryBrowser.jsx";
import { Button } from "@/components/ui/button";
import { HelpCircle } from "lucide-react";

import { shouldAutoOpenTutorial } from "./picker/tutorialSteps.js";

/** Screen 2 · Place picker: one card per region from regions.json. */
export default function Picker() {
  // A link straight to a country's source records (?country= / ?product=) shows the catalogue at once.
  const [searchParams] = useSearchParams();
  const deepLinked = searchParams.has("country") || searchParams.has("product");
  useDocumentMeta(
    "Pick a place",
    "Choose a place to see its fire calendar, its long-term trend and this week's burning.",
  );
  const { state, regions, debug } = useRegions();
  // The tutorial opens by itself on a first visit (remembered in localStorage), and from the button.
  const [firstVisit] = useState(shouldAutoOpenTutorial);
  const startTutorial = () => window.dispatchEvent(new CustomEvent("start-tutorial"));
  useEffect(() => { if (firstVisit) startTutorial(); }, [firstVisit]);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  // Every region, simulated ones too (labelled "Simulated region"), with the real regions first.
  const allRegions = state.status === "ok" ? [...state.data.regions].sort((a, b) => Number(Boolean(a.synthetic)) - Number(Boolean(b.synthetic))) : regions;
  const matchingRegions = allRegions.filter((region) =>
    region.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );
  const visibleRegions = matchingRegions.slice(page * 24, (page + 1) * 24);
  return (
    <section aria-labelledby="picker-title" className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 id="picker-title" className="text-2xl font-semibold tracking-tight">
          Pick a place
        </h1>
        <Button variant="outline" data-tour="launch" onClick={startTutorial}>
          <HelpCircle aria-hidden="true" /> How to use this site
        </Button>
      </div>

      <label className="block max-w-md space-y-2 text-sm font-medium">
        <span>Find a place to visualize</span>
        <input
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(0);
          }}
          placeholder="Search countries…"
          className="bg-background w-full rounded-md border px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2"
        />
      </label>
      <SectionState state={state} title="Places" variant="cards">
        {() =>
          allRegions.length ? (
            <ul data-tour="places" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visibleRegions.map((r) => (
                <li key={r.id}>
                  <RegionCard region={r} debug={debug} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground text-sm">No places are available yet.</p>
          )
        }
      </SectionState>
      {allRegions.length > 0 && matchingRegions.length === 0 ? (
        <p role="status">No places match your search.</p>
      ) : null}
      {matchingRegions.length > 24 ? (
        <nav aria-label="Place pages" className="flex items-center gap-4 text-sm">
          <button
            type="button"
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
            className="rounded-md border px-3 py-2 disabled:opacity-40"
          >
            Previous places
          </button>
          <span aria-live="polite">
            {page + 1} / {Math.ceil(matchingRegions.length / 24)}
          </span>
          <button
            type="button"
            disabled={(page + 1) * 24 >= matchingRegions.length}
            onClick={() => setPage(page + 1)}
            className="rounded-md border px-3 py-2 disabled:opacity-40"
          >
            Next places
          </button>
        </nav>
      ) : null}
      {/* The world archive catalogue (world.json) loads only when it is scrolled near, so it never competes with the
          place cards above it. */}
      {deepLinked ? (
        <CountryBrowser regions={regions} />
      ) : (
        <WhenNear minHeight="20rem">
          <CountryBrowser regions={regions} />
        </WhenNear>
      )}
    </section>
  );
}

function RegionCard({ region, debug }) {
  const has = (f) => region.files?.includes(f);
  const cardRef = useRef(null);
  const near = useNearViewport(cardRef);
  const outline = useOutlineThumb(region, near);
  const nowcast = useJson(has("nowcast") ? regionFilePath(region.id, "nowcast") : null);

  return (
    <Link
      ref={cardRef}
      to={{ pathname: `/r/${region.id}`, search: debug || region.synthetic ? "?debug=1" : "" }}
      className="bg-card text-card-foreground hover:bg-accent/40 focus-visible:ring-ring flex h-full min-h-[224px] flex-col gap-3 rounded-xl border p-4 transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h2 className="text-lg leading-tight font-semibold">{region.name}</h2>
          <p className="text-muted-foreground text-sm">{region.fire_type}</p>
        </div>
        <MiniOutline state={outline} name={region.name} />
      </div>
      <p className="text-sm text-pretty">{region.story}</p>
      <div className="mt-auto flex flex-wrap gap-2">
        {nowcast.status === "ok" ? (
          <Badge variant="secondary" data-status={nowcast.data.status}>
            This week: {statusLabel(nowcast.data.status)}
          </Badge>
        ) : (
          <SectionState state={nowcast} title="This week" hideWhenAbsent skeletonClassName="h-5 w-32">
            {() => null}
          </SectionState>
        )}
        {region.synthetic ? <Badge variant="outline">Simulated region</Badge> : null}
      </div>
    </Link>
  );
}

/**
 * The region's outline thumbnail. The card's text never waits for it: a same-size placeholder holds its place and the
 * outline fades in when it arrives (a few kB from outline-thumbs.json, no map library, no tiles).
 */
function MiniOutline({ state, name }) {
  if (state.status === "absent") return null;
  const thumb = state.status === "ok" ? state.thumb : null;
  return (
    <div className="mini-outline shrink-0" style={{ width: 96, height: 72 }}>
      {thumb ? (
        <svg
          viewBox={`0 0 ${thumb.width} ${thumb.height}`}
          width={thumb.width}
          height={thumb.height}
          role="img"
          aria-label={`Outline of ${name}`}
          className="text-foreground animate-in fade-in duration-300 motion-reduce:animate-none"
        >
          <path
            d={thumb.d}
            fill="currentColor"
            fillOpacity="0.12"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <div data-testid="outline-placeholder"><LoadingFrame title={`${name} outline`} variant="chart" className="h-[72px] w-24" /></div>
      )}
    </div>
  );
}

/** Renders its children once the spot has come near the viewport; until then an empty box of the given height. */
function WhenNear({ minHeight, children }) {
  const ref = useRef(null);
  const near = useNearViewport(ref, "400px");
  return near ? children : <div ref={ref} aria-hidden="true" style={{ minHeight }} />;
}
