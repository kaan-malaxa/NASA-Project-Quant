import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Download, FileImage, FileText, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { dataUrl } from "@/data/fetchJson.js";
import { regionFilePath } from "@/data/files.js";
import { buildCalendarCsv, buildSeriesCsv, exportFileName } from "@/lib/exportCsv.js";
import { saveFile, serializeSvg, svgToPng } from "@/lib/exportImage.js";
import { resolveDailyLens } from "@/lib/range.js";
import { fmtBytes, fmtInt } from "@/lib/format3.js";
import { sensorLabel } from "@/lib/labels.js";

const CSV_TYPE = "text/csv;charset=utf-8";

function Item({ title, description, children }) {
  return (
    <li className="space-y-2 rounded-lg border p-4">
      <div>
        <h4 className="font-medium">{title}</h4>
        {description ? <p className="text-muted-foreground text-sm">{description}</p> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </li>
  );
}

/** The root <svg> of whatever the chart handed back through its ref. */
function rootSvg(el) {
  if (!el) return null;
  if (el.tagName?.toLowerCase() === "svg") return el;
  return el.querySelector?.("svg") ?? null;
}

/** Contracts section 7, "Downloads offered": series CSV, calendar CSV, chart image, hotspot CSV, Season Brief. */
export default function DownloadsPanel({ region, files, url, lastDataDay, chartEl }) {
  const { search } = useLocation();
  const [imageError, setImageError] = useState(null);
  const range = { from: url.from, to: url.to ?? lastDataDay };
  const grain = url.view === "months" ? "month" : "week";
  const table = grain === "month" ? files.monthly : files.weekly;
  const svg = rootSvg(chartEl);

  const seriesCsv = () => {
    const daily = files.daily.data;
    const lens = resolveDailyLens(daily, url.lens).lens;
    saveFile(exportFileName({ region: region.id, lens, ...range, ext: "csv" }), buildSeriesCsv(daily, url.lens, range), CSV_TYPE);
  };

  const calendarCsv = () => {
    const meta = table.data.series_meta || {};
    const lens = url.lens === "naive_splice" || meta[url.lens] ? url.lens : "harmonized";
    saveFile(
      exportFileName({ region: region.id, lens, ...range, suffix: grain === "week" ? "weeks" : "months", ext: "csv" }),
      buildCalendarCsv(grain, table.data, lens, range),
      CSV_TYPE,
    );
  };

  const chartImage = async (format) => {
    setImageError(null);
    try {
      const background = getComputedStyle(document.body).backgroundColor;
      const out = serializeSvg(svg, { background: background && background !== "rgba(0, 0, 0, 0)" ? background : undefined });
      const name = exportFileName({ region: region.id, lens: url.lens, ...range, suffix: url.view, ext: format });
      if (format === "svg") saveFile(name, out.text, "image/svg+xml;charset=utf-8");
      else saveFile(name, await svgToPng(out, 2));
    } catch (err) {
      setImageError(String(err?.message || err));
    }
  };

  const archives =
    files.downloads?.status === "ok"
      ? (files.downloads.data.hotspot_archives || []).filter(
          (a) => a.year >= Number(range.from.slice(0, 4)) && a.year <= Number(range.to.slice(0, 4)),
        )
      : null;

  return (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold">Downloads</h3>
      <p className="text-muted-foreground max-w-3xl text-sm">
        Files follow the date range and record chosen above ({range.from} to {range.to}). Each CSV starts with a line
        saying what it holds, from which version of the data, and that the fire data come from NASA FIRMS.
      </p>
      <ul className="grid gap-3 md:grid-cols-2">
        <Item title="Daily series (CSV)" description="One line per day: value, likely range, kind, satellite and unit. Days without data are left blank.">
          <Button size="sm" onClick={seriesCsv} disabled={files.daily?.status !== "ok"}>
            <Download aria-hidden="true" /> Series CSV
          </Button>
          {files.daily?.status !== "ok" ? <span className="text-muted-foreground text-sm">Daily file not available for this place.</span> : null}
        </Item>

        <Item
          title={`Calendar table (CSV, ${grain === "week" ? "weeks" : "months"})`}
          description={`The ${grain === "week" ? "year × week" : "year × month"} table behind the calendar, for the years in the range.`}
        >
          <Button size="sm" onClick={calendarCsv} disabled={table?.status !== "ok"}>
            <Download aria-hidden="true" /> Calendar CSV
          </Button>
        </Item>

        <Item title="Chart image" description="The calendar chart as it looks now, as a picture (PNG, 2× size) or a drawing (SVG).">
          <Button size="sm" variant="outline" onClick={() => chartImage("png")} disabled={!svg}>
            <FileImage aria-hidden="true" /> PNG
          </Button>
          <Button size="sm" variant="outline" onClick={() => chartImage("svg")} disabled={!svg}>
            <FileImage aria-hidden="true" /> SVG
          </Button>
          {!svg ? <span className="text-muted-foreground text-sm">Available once the chart has loaded.</span> : null}
          {imageError ? (
            <span role="alert" className="text-sm">
              Could not make the image: {imageError}
            </span>
          ) : null}
        </Item>

        <Item title="Hotspot records (CSV)" description="Individual satellite detections, as cleaned by our pipeline.">
          {files.hotspots_recent?.status === "lazy" ? (
            <Button size="sm" variant="outline" asChild>
              <a href={dataUrl(regionFilePath(region.id, "hotspots_recent"))} download={`prometheus_torch_${region.id}_hotspots_recent.csv`}>
                <FileText aria-hidden="true" /> Last 31 days (near-real-time)
              </a>
            </Button>
          ) : (
            <span className="text-sm">Recent hotspot records are not available for this place.</span>
          )}
          <div className="w-full text-sm">
            {archives === null ? (
              <p>Yearly hotspot archives are not available for this place.</p>
            ) : archives.length === 0 ? (
              <p>No yearly hotspot archives overlap this date range.</p>
            ) : (
              <ul className="space-y-1">
                {archives.map((a) => (
                  <li key={`${a.year}-${a.sensor}`}>
                    <a href={a.url} className="underline underline-offset-4" download>
                      {a.year}, {sensorLabel(a.sensor)}
                    </a>{" "}
                    <span className="text-muted-foreground">
                      ({fmtInt(a.rows)} rows, {fmtBytes(a.bytes)}, compressed)
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Item>

        <Item title="Season Brief (PDF)" description="A one-page summary for printing or saving as PDF.">
          <Button size="sm" variant="outline" asChild>
            <Link to={{ pathname: `/r/${region.id}/brief`, search }}>
              <Printer aria-hidden="true" /> Season Brief
            </Link>
          </Button>
        </Item>
      </ul>
    </div>
  );
}
