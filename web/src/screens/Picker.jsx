import { useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import SectionState from "@/components/SectionState.jsx";
import { useRegions } from "@/data/useRegions.js";
import { useJson } from "@/data/useJson.js";
import { regionFilePath } from "@/data/files.js";
import { outlinePath } from "@/lib/outline.js";
import { statusLabel } from "@/lib/labels.js";
import { useDocumentMeta } from "@/lib/useDocumentMeta.js";
import CountryBrowser from "./CountryBrowser.jsx";

/** Screen 2 · Place picker: one card per region from regions.json. */
export default function Picker() {
  useDocumentMeta("Pick a place", "Choose a place to see its fire calendar, its long-term trend and this week's burning.");
  const { state, regions, debug } = useRegions();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const matchingRegions = regions.filter((region) => region.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const visibleRegions = matchingRegions.slice(page * 24, (page + 1) * 24);
  return (
    <section aria-labelledby="picker-title" className="space-y-6">
      <h1 id="picker-title" className="text-2xl font-semibold tracking-tight">
        Pick a place
      </h1>
      <label className="block max-w-md space-y-2 text-sm font-medium">
        <span>Find a place to visualize</span>
        <input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }}
          placeholder="Search countries…" className="bg-background w-full rounded-md border px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2" />
      </label>
      <SectionState state={state} title="Places">
        {() =>
          regions.length ? (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
      {regions.length > 0 && matchingRegions.length === 0 ? <p role="status">No places match your search.</p> : null}
      {matchingRegions.length > 24 ? (
        <nav aria-label="Place pages" className="flex items-center gap-4 text-sm">
          <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)}
            className="rounded-md border px-3 py-2 disabled:opacity-40">Previous places</button>
          <span aria-live="polite">{page + 1} / {Math.ceil(matchingRegions.length / 24)}</span>
          <button type="button" disabled={(page + 1) * 24 >= matchingRegions.length} onClick={() => setPage(page + 1)}
            className="rounded-md border px-3 py-2 disabled:opacity-40">Next places</button>
        </nav>
      ) : null}
      <CountryBrowser regions={regions} />
    </section>
  );
}

function RegionCard({ region, debug }) {
  const has = (f) => region.files?.includes(f);
  const outline = useJson(has("outline") ? regionFilePath(region.id, "outline") : null);
  const nowcast = useJson(has("nowcast") ? regionFilePath(region.id, "nowcast") : null);

  return (
    <Link
      to={{ pathname: `/r/${region.id}`, search: debug ? "?debug=1" : "" }}
      className="bg-card text-card-foreground hover:bg-accent/40 focus-visible:ring-ring flex h-full flex-col gap-3 rounded-xl border p-4 transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
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

function MiniOutline({ state, name }) {
  if (state.status === "absent") return null;
  if (state.status !== "ok") {
    return (
      <div className="w-24 shrink-0">
        <SectionState state={state} skeletonClassName="h-18">
          {() => null}
        </SectionState>
      </div>
    );
  }
  const shape = outlinePath(state.data, 96, 72, 3);
  if (!shape) return null;
  return (
    <svg
      viewBox={`0 0 ${shape.width} ${shape.height}`}
      width={shape.width}
      height={shape.height}
      role="img"
      aria-label={`Outline of ${name}`}
      className="text-foreground shrink-0"
    >
      <path d={shape.d} fill="currentColor" fillOpacity="0.12" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
    </svg>
  );
}
