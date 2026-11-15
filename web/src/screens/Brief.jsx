import { useEffect, useRef } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import SampleBanner from "@/components/SampleBanner.jsx";
import KindBadge from "@/components/KindBadge.jsx";
import { VizSlot, hasViz, useViz } from "@/components/Viz.jsx";
import { FIRMS_URL } from "@/app/AppShell.jsx";
import { useRegionData } from "@/data/useRegionData.js";
import { useUrlState } from "@/data/useUrlState.js";
import { useAnalysisPeriod } from "@/data/useAnalysisPeriod.js";
import { useSpatialShards } from "@/data/useSpatialShards.js";
import { spatialMap } from "@/lib/spatial.js";
import { useJson } from "@/data/useJson.js";
import { fmtAsOf, fmtRangePct, fmtSignedPct } from "@/lib/format.js";
import { statusLabel } from "@/lib/labels.js";
import { fitScale } from "@/lib/briefFit.js";
import "@/styles/brief.css";
import { useDocumentMeta } from "@/lib/useDocumentMeta.js";

const ok = (s) => s?.status === "ok";

/** Brief heading row: small caps label, then content. */
function Block({ title, children }) {
  return (
    <section className="mt-3">
      <h2 className="mb-1 text-[8pt] font-semibold tracking-wider uppercase">{title}</h2>
      {children}
    </section>
  );
}

/** #/r/:region/brief — screen 8, one printable page. Every sentence comes from the JSON sentence fields. */
export default function Brief() {
  const { region: id } = useParams();
  const { search } = useLocation();
  const { status, region, files: originalFiles, regionsState } = useRegionData(id);
  const [url] = useUrlState(region?.last_data_day);
  const analysis = useAnalysisPeriod(region, originalFiles, url, regionsState.status === "ok" ? regionsState.data?.configuration : undefined);
  const selectedFiles = analysis.files;
  const spatial = useSpatialShards(id, selectedFiles.spatial_index, [analysis.from, analysis.to], true);
  const files = selectedFiles.spatial_index?.status === "ok" ? {...selectedFiles, hex: spatial.status === "ok" ?
    {status:"ok", data:spatialMap(spatial.data, url.lens, selectedFiles.season?.data?.critical_weeks ?? [], selectedFiles.hex?.data)} : spatial} : selectedFiles;
  const manifest = useJson("manifest.json");
  const viz = useViz();
  useDocumentMeta(region ? `Season Brief: ${region.name}` : "Season Brief", "A one-page printable summary of a place's fire season.");
  const pageRef = useRef(null);
  const bannerRef = useRef(null);

  // One-page guard: just before printing (button or Ctrl/Cmd+P), shrink the content if it is taller than one sheet.
  useEffect(() => {
    const before = () => {
      const page = pageRef.current;
      if (!page) return;
      page.style.zoom = "";
      const cs = getComputedStyle(page);
      const noPrint = page.querySelector(".no-print");
      const skip = noPrint ? noPrint.offsetHeight + parseFloat(getComputedStyle(noPrint).marginBottom || "0") : 0;
      const banner = bannerRef.current?.offsetHeight ?? 0;
      const content = page.scrollHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - skip + banner;
      const scale = fitScale(content);
      if (scale < 1) page.style.zoom = String(scale);
    };
    const after = () => {
      if (pageRef.current) pageRef.current.style.zoom = "";
    };
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, []);

  if (status !== "ok") {
    return (
      <div className="brief">
        <div className="brief-page">
          <h1 className="text-xl font-semibold">Season Brief</h1>
          <p className="mt-2">
            {status === "loading" ? "Loading…" : `There is no Season Brief for “${id}”.`}{" "}
            <Link to="/pick" className="underline">
              Pick a place
            </Link>
          </p>
        </div>
      </div>
    );
  }

  const { trend, monthly, climatology, season, nowcast, hex, outline } = files;
  const stillLoading = viz === null || Object.values(files).some((f) => f?.status === "loading");
  const lastDay = region.last_data_day;
  const pageUrl = `${window.location.origin}${window.location.pathname}#/r/${region.id}${window.location.hash.includes("?") ? "?" + window.location.hash.split("?")[1] : ""}`;
  const codeVersion = manifest.status === "ok" ? manifest.data.code_version : [trend, monthly, nowcast].find(ok)?.data.code_version;
  const generated = manifest.status === "ok" ? manifest.data.generated_at : trend?.data?.generated_at;
  const today = generated ? new Date(generated).toLocaleDateString("en-GB", {day:"numeric",month:"long",year:"numeric",timeZone:"UTC"}) : "unavailable";
  const showCalendar = ok(monthly) && ok(climatology) && hasViz("CalendarHeatmap", viz);
  const showMap = ok(hex) && hasViz("HexMap", viz);

  return (
    <div className="brief">
      <div ref={bannerRef}>
        <SampleBanner />
      </div>
      <div className="brief-page" ref={pageRef}>
        <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
          <Link to={{pathname: `/r/${region.id}`, search}} className="text-sm underline">
            Back to {region.name}
          </Link>
          <Button onClick={() => window.print()} disabled={stillLoading}>
            <Printer aria-hidden="true" /> Print or save as PDF
          </Button>
        </div>

        <header className="border-b border-black pb-2">
          <p className="text-[8pt] tracking-wider uppercase">FireRosetta · Season Brief</p>
          <h1 className="text-[18pt] leading-tight font-semibold">{region.name}</h1>
          {analysis.index ? <p>Analysis years: {analysis.from}–{analysis.to}</p> : null}
          <p className="text-[9pt]">
            {region.fire_type} · Data through {lastDay} · Brief generated {today}
          </p>
        </header>

        {ok(trend) ? (
          <Block title="Is it really burning more?">
            <p className="text-[11pt] font-medium">{trend.data.sentence}</p>
            <p className="mt-1 text-[9pt] tabular-nums">
              Raw record: {fmtSignedPct(trend.data.naive.pct_per_decade)} per decade (likely range{" "}
              {fmtRangePct(trend.data.naive.lo, trend.data.naive.hi)}) · After harmonization:{" "}
              {fmtSignedPct(trend.data.harmonized.pct_per_decade)} per decade (likely range{" "}
              {fmtRangePct(trend.data.harmonized.lo, trend.data.harmonized.hi)}), {trend.data.years[0]}–{trend.data.years[1]}.
            </p>
          </Block>
        ) : null}

        {showCalendar ? (
          <Block title="The fire calendar, month by month">
            <figure className="brief-calendar">
              <VizSlot
                name="CalendarHeatmap"
                grain="month"
                monthly={monthly.data}
                climatology={climatology.data}
                season={ok(season) ? season.data : undefined}
                lens={url.lens}
                mode={url.mode}
                range={{ from: url.from, to: url.to ?? lastDay }}
              />
            </figure>
          </Block>
        ) : null}

        {/* Text on the left, the map on the right: keeps the page to one sheet. */}
        <div className={showMap ? "brief-row" : undefined}>
          <div>
            {ok(season) && season.data.windows?.length ? (
              <Block title="When it burns">
                <ul className="space-y-0.5">
                  {season.data.windows.map((w) => (
                    <li key={w.id}>{w.sentence}</li>
                  ))}
                </ul>
              </Block>
            ) : null}

            {ok(nowcast) ? (
              <Block title="This week">
                <p>
                  <span className="font-medium">{statusLabel(nowcast.data.status)}.</span> {nowcast.data.sentence}
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[8pt]">
                  {nowcast.data.as_of ? <span>As of {fmtAsOf(nowcast.data.as_of).utc}; near-real-time input.</span> : null}
                  <KindBadge kind={nowcast.data.kind} />
                </p>
              </Block>
            ) : null}

            <Block title="How to read this">
              {hasViz("Legend", viz) && showCalendar ? (
                <div className="mb-1">
                  <VizSlot name="Legend" scale={url.mode} unit={monthly.data.series_meta?.[url.lens]?.unit ?? "fire cell-days per month"} />
                </div>
              ) : null}
              <p className="text-[9pt]">
                Hatched cells: no data (the satellite was not working). Dashed, lighter cells: estimates. Counts are fire
                cell-days: one map hexagon on one day with at least one satellite hotspot, not a number of fires.
              </p>
              {url.mode === "anomaly" && ok(climatology) ? <p className="text-[8pt]">Comparison baseline: {climatology.data.baseline_years.join("–")}.</p> : null}
            </Block>
          </div>

          {showMap ? (
            <Block title="Where it burns">
              <figure className="brief-map">
                <VizSlot
                  name="HexMap"
                  hex={hex.data}
                  outline={ok(outline) ? outline.data : undefined}
                  metric="critical"
                  selectedCells={[]}
                  drawEnabled={false}
                />
              </figure>
              <figcaption className="text-[8pt]">
                {hex.data.unit} during the critical weeks, mean of {hex.data.years[0]}–{hex.data.years[1]}.
              </figcaption>
            </Block>
          ) : null}
        </div>

        <footer className="mt-4 flex items-end justify-between gap-4 border-t border-black pt-2 text-[8pt]">
          <div className="space-y-0.5">
            <p>
              Full record and methods: <a href={pageUrl}>{pageUrl}</a>
            </p>
            <p>
              Fire data: <a href={FIRMS_URL}>NASA FIRMS</a>. Not affiliated with or endorsed by NASA.
            </p>
            <p>Harmonized values are estimates on the MODIS Aqua scale.</p>
            <p>Code version {codeVersion ?? "unknown"}.</p>
          </div>
          <QRCodeSVG value={pageUrl} size={56} fgColor="#000" bgColor="#fff" title={`QR code for ${pageUrl}`} />
        </footer>
      </div>
    </div>
  );
}
