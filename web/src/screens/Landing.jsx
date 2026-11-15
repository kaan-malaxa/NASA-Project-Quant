import { Link } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import SectionState from "@/components/SectionState.jsx";
import { VizSlot } from "@/components/Viz.jsx";
import { useRegions } from "@/data/useRegions.js";
import { useJson } from "@/data/useJson.js";
import { regionFilePath } from "@/data/files.js";
import { useDocumentMeta } from "@/lib/useDocumentMeta.js";

const WHY_NOW_CLAIMS = ["snpp_end", "aqua_drift"];

/** Screen 1 · The broken ruler (contracts section 7, R5 role file section 9). */
export default function Landing() {
  useDocumentMeta("", "Is it really burning more, or did the satellite get better eyes? Satellite fire records from MODIS and VIIRS, put on one scale.");
  const { state: regionsState, defaultRegion } = useRegions();
  const rulerListed = defaultRegion?.files?.includes("ruler");
  const ruler = useJson(rulerListed ? regionFilePath(defaultRegion.id, "ruler") : null);
  const methods = useJson("methods.json");

  return (
    <div className="space-y-8">
      <section aria-labelledby="landing-title" className="space-y-4">
        <h1 id="landing-title" className="max-w-3xl text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          Is it really burning more, or did the satellite get better eyes?
        </h1>

        {regionsState.status !== "ok" ? (
          <SectionState state={regionsState} title="Places" />
        ) : !defaultRegion ? (
          <SectionState state={{ status: "absent" }} title="The broken ruler" />
        ) : (
          <SectionState state={ruler} title="The broken ruler" skeletonClassName="h-64">
            {(data) => (
              <figure className="space-y-3">
                <VizSlot name="BrokenRuler" ruler={data} animate placeholderClassName="h-64" />
                <figcaption className="max-w-3xl text-lg text-pretty">{data.sentence}</figcaption>
                <p className="text-muted-foreground text-sm">Shown for {defaultRegion.name}.</p>
              </figure>
            )}
          </SectionState>
        )}

        {methods.status === "ok" ? <WhyNow sources={methods.data.sources} /> : null}
      </section>

      <div className="flex flex-wrap items-end justify-between gap-6">
        <Button asChild size="lg">
          <Link to="/pick">Pick a place</Link>
        </Button>
        <PhoneQr />
      </div>
    </div>
  );
}

/** One line built only from methods.json sources; omitted when neither claim is present. */
function WhyNow({ sources }) {
  const claims = WHY_NOW_CLAIMS.map((id) => (sources || []).find((s) => s.claim_id === id)).filter(Boolean);
  if (!claims.length) return null;
  return (
    <p className="max-w-3xl text-sm text-pretty" data-testid="why-now">
      <span className="font-medium">Why now: </span>
      {claims.map((c, i) => (
        <span key={c.claim_id}>
          {i ? " " : ""}
          {c.text}{" "}
          <a href={c.url} target="_blank" rel="noreferrer" className="underline underline-offset-4">
            (source, checked {c.checked})
          </a>
        </span>
      ))}
    </p>
  );
}

function PhoneQr() {
  const url = typeof window !== "undefined" ? window.location.origin + window.location.pathname : "";
  if (!url) return null;
  return (
    <figure className="flex items-center gap-3">
      <div className="bg-background text-foreground rounded-md border p-2">
        <QRCodeSVG value={url} size={88} fgColor="currentColor" bgColor="transparent" title={`QR code for ${url}`} />
      </div>
      <figcaption className="text-sm">Open on your phone</figcaption>
    </figure>
  );
}
