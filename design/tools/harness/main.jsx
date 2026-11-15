// R6 tooling page (not part of the site). Renders R6's components from a data folder for checks and
// exports, driven by design/tools/run.mjs. Fetching lives HERE, not in web/src/viz (AGENTS.md eng. rule 5).
//
//   ?view=gallery                                   the Gallery
//   ?view=chart&chart=<id>&region=<id>[&theme=brief] one chart on a 1280×720 slide (captured at 1.5× = 1920×1080)
//   ?view=og&region=<id>                            the Open Graph card, 800×420 (captured at 1.5× = 1200×630)
//
// Every sentence with a number is filled from the data files (AGENTS.md science rule 5).

import "@fontsource-variable/inter";
import "../../../web/src/styles/tokens.css";
import { Suspense, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BrokenRuler,
  CalendarHeatmap,
  DriftChart,
  EyesightCurve,
  FireYearClock,
  Gallery,
  HexMap,
  HeldoutAgreement,
  Legend,
  PercentileStrip,
  TrendBars,
} from "../../../web/src/viz/index.js";
import { spatialMap } from "../../../web/src/lib/spatial.js";

const BASE = `${import.meta.env.BASE_URL}data/`;
const q = new URLSearchParams(location.search);
const FILES = [
  "weekly",
  "monthly",
  "climatology",
  "season",
  "trend",
  "ruler",
  "nowcast",
  "hex",
];

async function getJson(path) {
  const r = await fetch(BASE + path);
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return r.json();
}

async function loadRegion(id) {
  const [regions, manifest, methods] = await Promise.all(
    ["regions.json", "manifest.json", "methods.json"].map((p) =>
      getJson(p).catch(() => null),
    ),
  );
  const region =
    regions?.regions?.find((r) => r.id === id) ?? regions?.regions?.[0];
  if (!region) throw new Error("no region in regions.json");
  const files = {};
  await Promise.all(
    FILES.filter((f) => region.files.includes(f)).map(async (f) => {
      files[f] = await getJson(`${region.id}/${f}.json`).catch(() => undefined);
    }),
  );
  files.outline = await getJson(`${region.id}/outline.geojson`).catch(
    () => undefined,
  );
  if (q.get("chart") === "hexmap" && region.files.includes("spatial_index")) {
    const index = await getJson(`${region.id}/spatial_index.json`);
    const shards = [];
    for (const entry of index.years) shards.push(await getJson(`${region.id}/${entry.path}`));
    files.hex = spatialMap(shards, "harmonized", files.season?.critical_weeks ?? [], files.hex);
  }
  const sample =
    manifest?.contains_sample === true ||
    manifest?.code_version === "sample" ||
    regions?.code_version === "sample";
  return { region, files, methods, sample };
}

const yearsOf = (weekly) => {
  const ys = (weekly?.rows ?? []).map((r) => r.year);
  return ys.length ? [Math.min(...ys), Math.max(...ys)] : null;
};

/** Plain-words title per chart; numbers only from the data (baseline years). */
function chartSpec(id, d) {
  const { files, methods, region } = d;
  const range = { from: "2003-01-01", to: region.last_data_day };
  const currentYear = Number(region.last_data_day.slice(0, 4));
  const [b0, b1] = files.climatology?.baseline_years ?? [];
  const common = {
    weekly: files.weekly,
    monthly: files.monthly,
    climatology: files.climatology,
    season: files.season,
    lens: "harmonized",
    range,
  };
  const unitOf = (grain) =>
    (grain === "week" ? files.weekly : files.monthly)?.series_meta
      ?.harmonized?.[`unit_${grain}`] ??
    files.climatology?.[`unit_${grain}`] ??
    "fire cell-days";
  switch (id) {
    case "agreement":
      return {title: "Agreement on matching years excluded from fitting", width: 800, el: <HeldoutAgreement
        comparison={methods?.eyesight?.find((row) => row.region === region.id)?.heldout_compare ?? []} />};
    case "ruler":
      return {
        title: "The raw record and the harmonized record, as an index",
        el: <BrokenRuler ruler={files.ruler} />,
      };
    case "clock":
      return {
        title: "Fire year clock: one ring per year, January at the top",
        width: 520,
        el: (
          <FireYearClock
            {...common}
            mode="activity"
            currentYear={currentYear}
          />
        ),
      };
    case "calendar-activity":
      return {
        title: "Burning by month and year",
        width: 760,
        el: <CalendarHeatmap {...common} grain="month" mode="activity" />,
        legend: <Legend scale="activity" unit={unitOf("month")} />,
      };
    case "calendar-anomaly":
      return {
        title: b0
          ? `Each month compared with the same month in ${b0}–${b1}`
          : "Each month compared with a typical year",
        width: 760,
        el: <CalendarHeatmap {...common} grain="month" mode="anomaly" />,
        legend: <Legend scale="anomaly" unit={unitOf("month")} />,
      };
    case "verdict":
      return {
        title: "Change per decade: raw record and harmonized record",
        width: 900,
        el: <TrendBars trend={files.trend} />,
      };
    case "this-week":
      return {
        title: "This week compared with past years",
        width: 900,
        el: <PercentileStrip nowcast={files.nowcast} />,
      };
    case "drift":
      return {
        title: "Calibration factor k by year",
        el: (
          <DriftChart
            drift={methods?.drift ?? []}
            region={region.id}
            trustedThrough={methods?.decisions?.aqua_trusted_through}
          />
        ),
      };
    case "eyesight": {
      const e = methods?.eyesight?.find((x) => x.region === region.id);
      return {
        title: "How often Aqua detected what VIIRS detected",
        width: 900,
        el: <EyesightCurve eyesight={e} />,
      };
    }
    case "hexmap":
      return {
          title: "Where the record shows burning activity",
        el: (
          <Suspense fallback={null}>
            <HexMap hex={files.hex} outline={files.outline} metric="critical" />
          </Suspense>
        ),
      };
    default:
      throw new Error(`unknown chart ${id}`);
  }
}

const Credit = () => (
  <span>
    Data:{" "}
    <a
      href="https://firms.modaps.eosdis.nasa.gov/"
      style={{ color: "inherit" }}
    >
      NASA FIRMS
    </a>{" "}
    · FireRosetta
  </span>
);
const SampleTag = () => (
  <div
    data-sample-tag
    style={{
      position: "absolute",
      top: 16,
      right: 16,
      padding: "4px 10px",
      border: "2px dashed var(--fr-warning)",
      color: "var(--fr-warning)",
      borderRadius: 999,
      fontWeight: 700,
      fontSize: 13,
    }}
  >
    Sample data, not for release
  </div>
);

function Slide({ d, id }) {
  const s = chartSpec(id, d);
  return (
    <div
      className={q.get("theme") === "brief" ? "brief" : undefined}
      style={{
        position: "relative",
        width: 1280,
        height: 720,
        boxSizing: "border-box",
        padding: "34px 54px",
        display: "flex",
        flexDirection: "column",
        background: "var(--fr-bg)",
        color: "var(--fr-text)",
      }}
    >
      {d.sample && <SampleTag />}
      <div style={{ fontSize: 15, color: "var(--fr-muted)" }}>
        {d.region.name}
      </div>
      <h1
        style={{
          fontSize: 29,
          margin: "4px 0 14px",
          fontWeight: 650,
          lineHeight: 1.15,
        }}
      >
        {s.title}
      </h1>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: s.legend ? "row" : "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 24,
        }}
      >
        <div data-chart style={{ width: "100%", maxWidth: s.width ?? 1100 }}>
          {s.el}
        </div>
        {s.legend && <div style={{ width: 300, flex: "none" }}>{s.legend}</div>}
      </div>
      <div style={{ fontSize: 12, color: "var(--fr-muted)" }}>
        <Credit />
      </div>
    </div>
  );
}

function OgCard({ d }) {
  const ys = yearsOf(d.files.weekly);
  const peak = d.files.season?.windows?.[0]?.label;
  return (
    <div
      style={{
        position: "relative",
        width: 800,
        height: 420,
        boxSizing: "border-box",
        padding: 38,
        display: "flex",
        gap: 26,
        alignItems: "center",
        background: "var(--fr-bg)",
        color: "var(--fr-text)",
      }}
    >
      {d.sample && <SampleTag />}
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 43, fontWeight: 700, letterSpacing: -1 }}>
          FireRosetta
        </div>
        <div style={{ fontSize: 20, marginTop: 10, lineHeight: 1.25 }}>
          When does {d.region.name} burn?
        </div>
        {peak && (
          <div
            style={{ fontSize: 16, marginTop: 10, color: "var(--fr-warning)" }}
          >
            Main season: {peak}
          </div>
        )}
        {ys && (
          <div
            style={{
              fontSize: 15,
              marginTop: 10,
              color: "var(--fr-muted)",
              lineHeight: 1.35,
            }}
          >
            {ys[0]}–{ys[1]} satellite fire record, made comparable across
            sensors.
          </div>
        )}
        <div style={{ fontSize: 12, marginTop: 18, color: "var(--fr-muted)" }}>
          <Credit />
        </div>
      </div>
      <div data-chart style={{ width: 340 }}>
        <FireYearClock
          weekly={d.files.weekly}
          climatology={d.files.climatology}
          season={d.files.season}
          lens="harmonized"
          mode="activity"
          range={{ from: "2003-01-01", to: d.region.last_data_day }}
          currentYear={Number(d.region.last_data_day.slice(0, 4))}
        />
      </div>
    </div>
  );
}

function App() {
  const view = q.get("view") ?? "gallery";
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    if (view === "gallery") return;
    loadRegion(q.get("region")).then(setD, (e) => setErr(String(e)));
  }, [view]);
  if (view === "gallery") return <Gallery />;
  if (err) return <p data-error>{err}</p>;
  if (!d) return <p>Loading…</p>;
  return (
    <div
      data-ready
      data-sample={d.sample ? "1" : "0"}
      data-region={d.region.id}
    >
      {view === "og" ? <OgCard d={d} /> : <Slide d={d} id={q.get("chart")} />}
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
