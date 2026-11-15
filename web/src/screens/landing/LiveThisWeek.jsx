import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import KindBadge from "@/components/KindBadge.jsx";
import { useJson } from "@/data/useJson.js";
import { regionFilePath } from "@/data/files.js";
import NowcastBody from "@/screens/region/NowcastBody.jsx";
import Reveal from "./Reveal.jsx";
import { BADGED_KINDS, liveRegion } from "./liveRegion.js";

/** Loads its file only once the section is near the viewport (or straight away without IntersectionObserver). */
function useNearViewport(ref, margin = "400px") {
  const [near, setNear] = useState(false);
  useEffect(() => {
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
  }, [ref, margin]);
  return near;
}

const isSample = (n) => n?.kind === "sample" || n?.code_version === "sample";

/**
 * Landing page · "Live this week": the nowcast of the first non-synthetic region, as one card.
 * The body is the region page's own NowcastBody (same wording for every status). If nowcast.json is missing or fails
 * validation the whole section is hidden here (the region page shows the error instead); dev builds log why.
 * @param {object} props
 * @param {object[]} props.regions regions.json `regions` (all of them; synthetic ones are skipped)
 */
export default function LiveThisWeek({ regions }) {
  const region = liveRegion(regions);
  const ref = useRef(null);
  const near = useNearViewport(ref);
  const path = region && near ? regionFilePath(region.id, "nowcast") : null;
  const state = useJson(path);
  // "absent" = not on the server; before the fetch starts useJson also says "absent", so only count it with a path.
  const failed = path !== null && ["absent", "invalid", "network"].includes(state.status);

  useEffect(() => {
    if (failed && import.meta.env.DEV) {
      console.info(`Live this week hidden: ${region?.id}/nowcast.json ${state.status}.`, state.detail ?? "");
    }
  }, [failed, region, state]);

  if (!region || failed) return null;
  const n = state.status === "ok" ? state.data : null;

  return (
    <Reveal aria-labelledby="live-title" className="landing-live">
      <div ref={ref} className="mx-auto w-full max-w-6xl px-4 pb-16">
        <div className="bg-card text-card-foreground space-y-4 rounded-xl border p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                Live this week
              </p>
              <h2 id="live-title" className="text-2xl font-bold tracking-tight">
                {region.name}
              </h2>
            </div>
            {n ? (
              <div className="flex flex-wrap gap-2" data-testid="live-badges">
                {BADGED_KINDS.includes(n.kind) ? <KindBadge kind={n.kind} /> : null}
                {isSample(n) ? <KindBadge kind="sample" /> : null}
              </div>
            ) : null}
          </div>
          {/* Fixed minimum height: the skeleton and the loaded body take the same room, so nothing jumps. */}
          <div className="min-h-48" data-testid="live-body">
            {n ? (
              <NowcastBody nowcast={n} kindBadge={false} />
            ) : (
              <div role="status" aria-label="Loading this week's activity">
                <Skeleton className="h-48 w-full" />
              </div>
            )}
          </div>
          <Button asChild size="lg">
            <Link to={`/r/${region.id}`}>See the full picture</Link>
          </Button>
        </div>
      </div>
    </Reveal>
  );
}
