// Development gallery, mounted by R5 at #/gallery.
// The ONE file in viz/ allowed to fetch, and only from `${import.meta.env.BASE_URL}data/` (AGENTS.md eng. rule 5).

import { Component, Suspense, lazy, useEffect, useMemo, useState } from "react";
import { BrokenRuler } from "./BrokenRuler";
import { CalendarHeatmap } from "./CalendarHeatmap";
import { DriftChart } from "./DriftChart";
import { EyesightCurve } from "./EyesightCurve";
import { FireYearClock } from "./FireYearClock";
import { KindBadge } from "./KindBadge";
import { Legend } from "./Legend";
import { PercentileStrip } from "./PercentileStrip";
import { SeasonShiftChart } from "./SeasonShiftChart";
import { TrendBars } from "./TrendBars";
import {
  FIXTURE_CLIMATOLOGY,
  FIXTURE_MONTHLY,
  FIXTURE_NOWCAST,
  FIXTURE_NOWCAST_VARIANTS,
  FIXTURE_TREND,
  FIXTURE_TREND_VARIANTS,
  FIXTURE_REGION,
  FIXTURE_RULER,
  FIXTURE_SEASON,
  FIXTURE_WEEKLY,
} from "./gallery/fixtures";
import { GALLERY_STATES, STATE_LABEL, bundleForState } from "./gallery/states";

const HexMap = lazy(() => import("./HexMap"));

const DATA_BASE = `${import.meta.env.BASE_URL}data/`;

async function getJson(path) {
  const res = await fetch(`${DATA_BASE}${path}`);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return await res.json();
}

/** Region files the gallery draws, keyed by the names used in regions.json → files. */
const REGION_FILES = {
  weekly: "weekly.json",
  monthly: "monthly.json",
  climatology: "climatology.json",
  season: "season.json",
  trend: "trend.json",
  ruler: "ruler.json",
  nowcast: "nowcast.json",
  hex: "hex.json",
  outline: "outline.geojson",
};

const LENSES = ["harmonized", "aqua_raw", "viirs_raw", "naive_splice", "viirs_as_aqua", "viirs_equiv"];
const KINDS = ["observed", "harmonized", "estimated", "missing", "sample"];

// ---- small layout pieces ------------------------------------------------------------------

const S = {
  page: {
    background: "var(--fr-bg)",
    color: "var(--fr-text)",
    fontFamily: "var(--fr-font-sans)",
    padding: "var(--fr-space-4)",
    minHeight: "100vh",
    boxSizing: "border-box",
  },
  controls: { display: "flex", flexWrap: "wrap", gap: "var(--fr-space-4)", margin: "var(--fr-space-4) 0" },
  label: {
    display: "flex",
    flexDirection: "column",
    gap: "var(--fr-space-1)",
    fontSize: "var(--fr-text-sm)",
  },
  select: {
    background: "var(--fr-surface)",
    color: "var(--fr-text)",
    border: "1px solid var(--fr-border)",
    borderRadius: "var(--fr-radius-sm)",
    padding: "var(--fr-space-1) var(--fr-space-2)",
    fontSize: "var(--fr-text-sm)",
  },
  section: {
    borderTop: "1px solid var(--fr-border)",
    paddingTop: "var(--fr-space-4)",
    marginTop: "var(--fr-space-6)",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
    gap: "var(--fr-space-4)",
  },
  card: {
    background: "var(--fr-surface)",
    border: "1px solid var(--fr-border)",
    borderRadius: "var(--fr-radius)",
    padding: "var(--fr-space-3)",
    minWidth: 0,
  },
  caption: { fontSize: "var(--fr-text-xs)", color: "var(--fr-muted)", margin: "0 0 var(--fr-space-2)" },
  note: { fontSize: "var(--fr-text-sm)", color: "var(--fr-muted)", maxWidth: 760 },
  error: { fontSize: "var(--fr-text-sm)", color: "var(--fr-warning)" },
};

class CardBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  render() {
    return this.state.error ? <p style={S.error}>Crashed: {this.state.error}</p> : this.props.children;
  }
}

function Card({ caption, children }) {
  return (
    <figure style={{ ...S.card, margin: 0 }}>
      <figcaption style={S.caption}>{caption}</figcaption>
      <CardBoundary>{children}</CardBoundary>
    </figure>
  );
}

function Absent({ file }) {
  return <p style={S.note}>Not drawn: {file} is not available for this region.</p>;
}

const ENTRIES = [
  {
    name: "BrokenRuler",
    render: (b) => (b.ruler ? <BrokenRuler ruler={b.ruler} animate /> : <Absent file="ruler.json" />),
  },
  {
    name: "FireYearClock",
    render: (b, c) =>
      b.weekly && b.climatology ? (
        <FireYearClock
          weekly={b.weekly}
          climatology={b.climatology}
          season={b.season}
          lens={c.lens}
          mode={c.mode}
          range={c.range}
          currentYear={yearOf(c.region)}
          onSelect={(cell) => c.log(`FireYearClock onSelect ${fmtCell(cell)}`)}
        />
      ) : (
        <Absent file="weekly.json or climatology.json" />
      ),
  },
  {
    name: "CalendarHeatmap · week",
    render: (b, c) =>
      b.weekly && b.climatology ? (
        <CalendarHeatmap
          grain="week"
          weekly={b.weekly}
          climatology={b.climatology}
          season={b.season}
          lens={c.lens}
          mode={c.mode}
          range={c.range}
          onSelect={(cell) => c.log(`CalendarHeatmap(week) onSelect ${fmtCell(cell)}`)}
        />
      ) : (
        <Absent file="weekly.json or climatology.json" />
      ),
  },
  {
    name: "CalendarHeatmap · month",
    render: (b, c) =>
      b.monthly && b.climatology ? (
        <CalendarHeatmap
          grain="month"
          monthly={b.monthly}
          climatology={b.climatology}
          season={b.season}
          lens={c.lens}
          mode={c.mode}
          range={c.range}
          onSelect={(cell) => c.log(`CalendarHeatmap(month) onSelect ${fmtCell(cell)}`)}
        />
      ) : (
        <Absent file="monthly.json or climatology.json" />
      ),
  },
  {
    name: "SeasonShiftChart",
    render: (b) => (b.season ? <SeasonShiftChart season={b.season} /> : <Absent file="season.json" />),
  },
  {
    name: "TrendBars",
    render: (b) => (b.trend ? <TrendBars trend={b.trend} /> : <Absent file="trend.json" />),
  },
  {
    name: "PercentileStrip",
    render: (b) => (b.nowcast ? <PercentileStrip nowcast={b.nowcast} /> : <Absent file="nowcast.json" />),
  },
  {
    name: "HexMap",
    render: (b, c) =>
      b.hex ? (
        <Suspense fallback={<p style={S.note}>Loading map…</p>}>
          <HexMap
            hex={b.hex}
            outline={b.outline}
            metric={c.metric}
            drawEnabled
            onAoiChange={(cells) =>
              c.log(`HexMap onAoiChange [${cells.length} cells] ${cells.slice(0, 3).join(",")}`)
            }
          />
        </Suspense>
      ) : (
        <Absent file="hex.json" />
      ),
  },
  {
    name: "EyesightCurve",
    render: (b, c) => {
      const e = eyesightFor(b.methods, c.region.id);
      return e ? <EyesightCurve eyesight={e} /> : <Absent file="methods.json → eyesight for this region" />;
    },
  },
  {
    name: "DriftChart",
    render: (b, c) =>
      b.methods ? (
        <DriftChart
          drift={b.methods.drift}
          region={c.region.id}
          trustedThrough={b.methods.decisions.aqua_trusted_through}
        />
      ) : (
        <Absent file="methods.json" />
      ),
  },
];

function yearOf(r) {
  return Number(r.last_data_day.slice(0, 4));
}
function fmtCell(c) {
  return `year ${c.year}${c.week ? ` week ${c.week}` : ""}${c.month ? ` month ${c.month}` : ""}`;
}
function eyesightFor(m, region) {
  return m?.eyesight.find((e) => e.region === region);
}

export function Gallery() {
  const [regions, setRegions] = useState(null);
  const [regionId, setRegionId] = useState("");
  const [bundle, setBundle] = useState({});
  const [errors, setErrors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [stateFilter, setStateFilter] = useState("all");
  const [lens, setLens] = useState("harmonized");
  const [mode, setMode] = useState("activity");
  const [metric, setMetric] = useState("critical");
  const [events, setEvents] = useState([]);
  const [methods, setMethods] = useState(undefined);
  const [previewWidth, setPreviewWidth] = useState("auto");
  const [rangeChoice, setRangeChoice] = useState("full");

  // regions.json and methods.json, once. The fabricated fixture is always offered last.
  useEffect(() => {
    let alive = true;
    getJson("regions.json")
      .then((r) => {
        if (!alive) return;
        setRegions([...r.regions, FIXTURE_REGION]);
        setRegionId(r.regions[0]?.id ?? FIXTURE_REGION.id);
      })
      .catch((e) => {
        if (!alive) return;
        setErrors([`${String(e instanceof Error ? e.message : e)} (showing the fabricated fixture only)`]);
        setRegions([FIXTURE_REGION]);
        setRegionId(FIXTURE_REGION.id);
      });
    getJson("methods.json")
      .then((m) => alive && setMethods(m))
      .catch(() => undefined); // optional; shown as absent on the cards that need it
    return () => {
      alive = false;
    };
  }, []);

  const region = regions?.find((r) => r.id === regionId);

  // The region's files.
  useEffect(() => {
    if (!region) return;
    if (region.id === FIXTURE_REGION.id) {
      setBundle({
        ruler: FIXTURE_RULER,
        weekly: FIXTURE_WEEKLY,
        monthly: FIXTURE_MONTHLY,
        climatology: FIXTURE_CLIMATOLOGY,
        season: FIXTURE_SEASON,
        trend: FIXTURE_TREND,
        nowcast: FIXTURE_NOWCAST,
      });
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    const wanted = Object.keys(REGION_FILES).filter((k) => region.files.includes(k));
    Promise.allSettled(wanted.map((k) => getJson(`${region.id}/${REGION_FILES[k]}`))).then((results) => {
      if (!alive) return;
      const next = {};
      const errs = [];
      results.forEach((res, i) => {
        if (res.status === "fulfilled") next[wanted[i]] = res.value;
        else errs.push(String(res.reason instanceof Error ? res.reason.message : res.reason));
      });
      setBundle(next);
      setErrors(errs);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [region]);

  const full = useMemo(() => ({ ...bundle, methods }), [bundle, methods]);
  const states = stateFilter === "all" ? GALLERY_STATES : [stateFilter];
  const byState = useMemo(
    () => Object.fromEntries(GALLERY_STATES.map((s) => [s, bundleForState(full, s)])),
    [full],
  );
  const log = (msg) =>
    setEvents((ev) => [`${new Date().toISOString().slice(11, 19)} ${msg}`, ...ev].slice(0, 8));
  const range = useMemo(
    () =>
      rangeChoice === "full"
        ? { from: "2003-01-01", to: region?.last_data_day ?? "2003-01-01" }
        : { from: "2010-03-15", to: "2015-10-14" }, // gallery test range: exercises the 25% dimming
    [rangeChoice, region],
  );
  const unit =
    bundle.weekly?.series_meta?.[lens === "naive_splice" ? "aqua_raw" : lens]?.unit ??
    "fire cell-days per week";

  return (
    <div style={S.page}>
      <h1 style={{ fontSize: "var(--fr-text-xl)", margin: 0 }}>Component gallery</h1>
      <p style={S.note}>
        Development page. Every component in every state. States other than “Normal” are fabricated in the
        browser from the sample files, for testing only.
      </p>

      <div style={S.controls}>
        <label style={S.label}>
          Region
          <select
            className="fr-focus-ring"
            style={S.select}
            value={regionId}
            onChange={(e) => setRegionId(e.target.value)}
            disabled={!regions}
          >
            {(regions ?? []).map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
                {r.synthetic ? " (synthetic)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label style={S.label}>
          State
          <select
            className="fr-focus-ring"
            style={S.select}
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value)}
          >
            <option value="all">All states</option>
            {GALLERY_STATES.map((s) => (
              <option key={s} value={s}>
                {STATE_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label style={S.label}>
          Lens
          <select
            className="fr-focus-ring"
            style={S.select}
            value={lens}
            onChange={(e) => setLens(e.target.value)}
          >
            {LENSES.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label style={S.label}>
          Mode
          <select
            className="fr-focus-ring"
            style={S.select}
            value={mode}
            onChange={(e) => setMode(e.target.value)}
          >
            <option value="activity">activity</option>
            <option value="anomaly">anomaly</option>
          </select>
        </label>
        <label style={S.label}>
          Range
          <select
            className="fr-focus-ring"
            style={S.select}
            value={rangeChoice}
            onChange={(e) => setRangeChoice(e.target.value)}
          >
            <option value="full">whole record</option>
            <option value="part">15 Mar 2010 – 14 Oct 2015 (test dimming)</option>
          </select>
        </label>
        <label style={S.label}>
          Preview width
          <select
            className="fr-focus-ring"
            style={S.select}
            value={previewWidth}
            onChange={(e) => setPreviewWidth(e.target.value)}
          >
            <option value="auto">auto (grid)</option>
            <option value="360">360 px</option>
            <option value="1280">1280 px</option>
          </select>
        </label>
        <label style={S.label}>
          Map metric
          <select
            className="fr-focus-ring"
            style={S.select}
            value={metric}
            onChange={(e) => setMetric(e.target.value)}
          >
            <option value="critical">critical</option>
            <option value="all_year">all_year</option>
          </select>
        </label>
      </div>

      {errors.length > 0 && (
        <ul style={S.error}>
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      {loading && <p style={S.note}>Loading…</p>}
      <p style={S.note} aria-live="polite">
        Events: {events.length === 0 ? "none yet" : events.join(" · ")}
      </p>

      <section style={S.section}>
        <h2 style={{ fontSize: "var(--fr-text-lg)" }}>KindBadge · Legend (state-independent)</h2>
        <div style={S.grid}>
          <Card caption="KindBadge · every kind">
            <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--fr-space-2)" }}>
              {KINDS.map((k) => (
                <KindBadge key={k} kind={k} />
              ))}
            </div>
          </Card>
          <Card caption="Legend · activity">
            <Legend scale="activity" unit={unit} />
          </Card>
          <Card caption="Legend · anomaly">
            <Legend scale="anomaly" unit={unit} />
          </Card>
        </div>
      </section>

      <section style={S.section}>
        <h2 style={{ fontSize: "var(--fr-text-lg)" }}>
          TrendBars · PercentileStrip: every look (fabricated fixture variants)
        </h2>
        <div
          style={
            previewWidth === "auto"
              ? S.grid
              : { display: "grid", gap: "var(--fr-space-4)", width: Number(previewWidth) }
          }
        >
          {FIXTURE_TREND_VARIANTS.map((v) => (
            <Card key={v.label} caption={`TrendBars · ${v.label}`}>
              <TrendBars trend={v.trend} />
            </Card>
          ))}
          {FIXTURE_NOWCAST_VARIANTS.map((v) => (
            <Card key={v.label} caption={`PercentileStrip · ${v.label}`}>
              <PercentileStrip nowcast={v.nowcast} />
            </Card>
          ))}
        </div>
      </section>

      {region &&
        ENTRIES.map((entry) => (
          <section key={entry.name} style={S.section}>
            <h2 style={{ fontSize: "var(--fr-text-lg)" }}>{entry.name}</h2>
            <div
              style={
                previewWidth === "auto"
                  ? S.grid
                  : {
                      display: "grid",
                      gap: "var(--fr-space-4)",
                      width: Number(previewWidth),
                      maxWidth: "none",
                    }
              }
            >
              {states.map((s) => (
                <Card key={s} caption={STATE_LABEL[s]}>
                  {entry.render(byState[s], { lens, mode, metric, region, log, range })}
                </Card>
              ))}
            </div>
          </section>
        ))}
    </div>
  );
}
