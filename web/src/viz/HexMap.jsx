// HexMap (spec §9.8, prompt D2): where the hotspots were, as H3 res-5 hexagons coloured with stepped
// activityScale colours, with the region outline. Loaded through React.lazy from index.js, so this file
// (and hexLayout.js) are the only places that pull in maplibre-gl, h3-js and terra-draw.
//
// - Basemap: OpenFreeMap "liberty" at reduced opacity. If the style errors or has not loaded within
//   4 s, switch to an empty style on the page background, so hexagons and outline always render.
// - Hover: tooltip with value + unit. Click: toggle a cell. "Draw area": terra-draw rectangle → every
//   res-5 cell whose centre is inside it. Every selection change is reported through onAoiChange.
// - No WebGL (or a test environment): a static SVG of the same hexagons in the same colours.
// - ref: the root <svg> in the SVG fallback; the map container <div> when the WebGL map is used.

import "maplibre-gl/dist/maplibre-gl.css";
import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { VizDefs } from "./defs";
import { bounds, cellsInPolygon, displayGeometry, fitProjection, hexFeatures, ringsPath, toggleCell } from "./hexLayout";
import { mergeRefs, useElementWidth } from "./hooks";
import { CHART_FONT, KIND_STYLE, formatNumber } from "./theme";

const BASEMAP_URL = "https://tiles.openfreemap.org/styles/liberty";
const BASEMAP_TIMEOUT_MS = 4000;
const BASEMAP_OPACITY = 0.35;
const EMPTY_STYLE = { version: 8, sources: {}, layers: [] };
const METRIC_WORDS = { critical: "during the critical weeks", all_year: "over the whole year" };
const TABLE_MAX = 500;

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

/** True when the browser can make a WebGL context (false in jsdom and on blocked GPUs). */
// Tested once per page, and the test context is released at once: browsers keep only ~16 WebGL
// contexts and drop the oldest, which would take a real map's context (D2: found in the gallery).
let webglChecked;
function hasWebGL() {
  if (webglChecked !== undefined) return webglChecked;
  webglChecked = false;
  try {
    if (typeof window === "undefined" || typeof document === "undefined") return false;
    if (navigator.userAgent?.includes("jsdom")) return false;
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2") || c.getContext("webgl");
    webglChecked = Boolean(gl);
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    webglChecked = false;
  }
  return webglChecked;
}

// maplibre-gl 6 starts its tile worker from a separate file that bundlers cannot see; ship it
// as a static asset and point maplibre at it once (D2: "Worker failed to load" otherwise).
let workerSet = false;
async function loadMaplibre() {
  const [lib, worker] = await Promise.all([
    import("maplibre-gl"), // named exports only (no default export)
    import("maplibre-gl/dist/maplibre-gl-worker.mjs?url"),
  ]);
  if (!workerSet) {
    lib.setWorkerUrl(worker.default);
    workerSet = true;
  }
  return lib;
}

/** MapLibre cannot read CSS variables: turn "var(--fr-x)" into its computed colour on `el`. */
function cssColorResolver(el) {
  const cs = el ? getComputedStyle(el) : null;
  const resolve = (v, depth = 0) => {
    if (typeof v !== "string") return "rgba(0,0,0,0)";
    const m = v.match(/^var\((--[\w-]+)\)$/);
    if (m) {
      const got = cs?.getPropertyValue(m[1]).trim();
      return got && depth < 5 ? resolve(got, depth + 1) : "rgba(0,0,0,0)";
    }
    if (v.startsWith("url(")) return "rgba(0,0,0,0)"; // the hatch pattern cannot be a map fill
    return v;
  };
  return resolve;
}

/** Dim every basemap layer so the hexagons stay the loudest thing on the map. */
function dimBasemap(map) {
  const PROPS = {
    background: ["background-opacity"],
    fill: ["fill-opacity"],
    line: ["line-opacity"],
    raster: ["raster-opacity"],
    "fill-extrusion": ["fill-extrusion-opacity"],
    symbol: ["text-opacity", "icon-opacity"],
    circle: ["circle-opacity"],
  };
  for (const layer of map.getStyle()?.layers ?? []) {
    for (const p of PROPS[layer.type] ?? []) {
      try {
        map.setPaintProperty(layer.id, p, BASEMAP_OPACITY);
      } catch {
        /* a layer that rejects the property keeps its own look */
      }
    }
  }
}

function HexMapImpl(
  { hex, outline, metric = "critical", selectedCells, drawEnabled = false, onAoiChange },
  ref,
) {
  const [webgl] = useState(hasWebGL);
  const [mapFailed, setMapFailed] = useState(false);
  const useSvg = !webgl || mapFailed;

  // ---- selection: starts from the prop, every change is reported ----
  const [selected, setSelected] = useState(() => [...(selectedCells ?? [])].sort());
  const selKey = (selectedCells ?? []).join(",");
  useEffect(() => {
    setSelected([...(selectedCells ?? [])].sort());
    // selKey stands for selectedCells' contents
  }, [selKey]);
  const onAoiRef = useRef(onAoiChange);
  onAoiRef.current = onAoiChange;
  const commit = useCallback((next) => {
    setSelected(next);
    onAoiRef.current?.(next);
  }, []);

  const unit = hex?.unit ?? "";
  const cells = hex?.cells ?? [];
  const metricWords = METRIC_WORDS[metric] ?? "";
  const aria =
    cells.length === 0
      ? "Map: no hexagon data for this region."
      : `Map of ${cells.length} hexagons, each about 250 square kilometres, coloured by ${unit} ${metricWords}` +
        `${hex?.years ? `, ${hex.years[0]}–${hex.years[1]}` : ""}. Brighter means more. ` +
        `${selected.length} selected. The table lists every hexagon's values.`;

  const table = (
    <div className="fr-sr-only">
      <table>
        <caption>
          Hexagons ranked by {unit} {metricWords}
          {cells.length > TABLE_MAX ? ` (top ${TABLE_MAX} of ${cells.length})` : ""}.
        </caption>
        <thead>
          <tr>
            <th scope="col">Hexagon (H3)</th>
            <th scope="col">Critical weeks</th>
            <th scope="col">Whole year</th>
          </tr>
        </thead>
        <tbody>
          {[...cells]
            .sort((a, b) => (b[metric] ?? -1) - (a[metric] ?? -1))
            .slice(0, TABLE_MAX)
            .map((c) => (
              <tr key={c.h3}>
                <th scope="row">{c.h3}</th>
                <td>{isNum(c.critical) ? formatNumber(c.critical) : "no data"}</td>
                <td>{isNum(c.all_year) ? formatNumber(c.all_year) : "no data"}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );

  return useSvg ? (
    <>
      <HexSvg
        ref={ref}
        hex={hex}
        outline={outline}
        metric={metric}
        selected={selected}
        onToggle={(h3) => commit(toggleCell(selected, h3))}
        aria={aria}
        note={webgl ? "The interactive map could not start, so this is a static drawing." : null}
      />
      {table}
    </>
  ) : (
    <>
      <HexGl
        ref={ref}
        hex={hex}
        outline={outline}
        metric={metric}
        selected={selected}
        drawEnabled={drawEnabled}
        commit={commit}
        aria={aria}
        onFail={() => setMapFailed(true)}
      />
      {table}
    </>
  );
}

// ---------------------------------------------------------------------------------------
// WebGL map
// ---------------------------------------------------------------------------------------

const HexGl = forwardRef(function HexGl(
  { hex, outline, metric, selected, drawEnabled, commit, aria, onFail },
  ref,
) {
  const boxRef = useRef(null);
  const rootRef = useMemo(() => mergeRefs(ref, boxRef), [ref]);
  const mapRef = useRef(null);
  const drawRef = useRef(null);
  const dataRef = useRef(null);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const [ready, setReady] = useState(false); // our layers are on the map
  const [basemapOn, setBasemapOn] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [tip, setTip] = useState(null);

  const unit = hex?.unit ?? "";
  const kind = hex?.kind;

  // Data for the map, with CSS-variable colours resolved on the container.
  const data = useMemo(() => {
    const resolve = cssColorResolver(boxRef.current ?? document.documentElement);
    const { fc } = hexFeatures(hex?.cells, metric, resolve);
    const line = outline?.type ? outline : { type: "FeatureCollection", features: [] };
    const fit = bounds(outline?.type ? outline : fc);
    return {
      fc: displayGeometry(fc, fit),
      outline: displayGeometry(line, fit),
      colors: {
        edge: resolve("var(--fr-bg)"),
        text: resolve("var(--fr-text)"),
        accent: resolve("var(--fr-accent)"),
        estimate: resolve("var(--fr-estimate-stroke)"),
      },
      fit,
      kind: hex?.kind,
    };
  }, [hex, metric, outline]);
  dataRef.current = data;

  // ---- create the map once ----
  useEffect(() => {
    let cancelled = false;
    let timer = null;
    let map = null;
    let settled = false; // basemap decision made
    (async () => {
      let maplibregl;
      try {
        maplibregl = await loadMaplibre();
      } catch {
        onFail();
        return;
      }
      if (cancelled || !boxRef.current) return;
      try {
        map = new maplibregl.Map({
          container: boxRef.current,
          style: BASEMAP_URL,
          attributionControl: { compact: true },
          dragRotate: false,
          pitchWithRotate: false,
          bounds: dataRef.current.fit ?? undefined,
          fitBoundsOptions: { padding: 24 },
        });
      } catch {
        onFail();
        return;
      }
      mapRef.current = map;
      map.touchZoomRotate.disableRotation();

      const fallback = () => {
        if (settled) return;
        settled = true;
        setBasemapOn(false);
        map.setStyle(EMPTY_STYLE, { diff: false });
      };
      timer = setTimeout(fallback, BASEMAP_TIMEOUT_MS);
      map.on("error", () => {
        if (!settled) fallback();
      });

      map.on("style.load", () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          dimBasemap(map);
          setBasemapOn(true);
        }
        addLayers(map, dataRef.current, selectedRef.current);
        setReady(true);
      });

      map.on("mousemove", "fr-hex-fill", (e) => {
        const f = e.features?.[0];
        if (!f) return;
        map.getCanvas().style.cursor = "pointer";
        setTip({ x: e.point.x, y: e.point.y, value: f.properties.value, h3: f.properties.h3 });
      });
      map.on("mouseleave", "fr-hex-fill", () => {
        map.getCanvas().style.cursor = "";
        setTip(null);
      });
      map.on("click", "fr-hex-fill", (e) => {
        if (drawRef.current?.drawing) return;
        const h3 = e.features?.[0]?.properties?.h3;
        if (h3) commit(toggleCell(selectedRef.current, h3));
      });
    })();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      try {
        drawRef.current?.draw?.stop();
      } catch {
        /* already stopped */
      }
      drawRef.current = null;
      map?.remove();
      mapRef.current = null;
    };
    // The map is created once; data and selection changes are pushed in the effects below.
  }, []);

  // ---- push data and selection changes ----
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    map.getSource("fr-hex")?.setData(data.fc);
    map.getSource("fr-outline")?.setData(data.outline);
    if (data.fit) map.fitBounds(data.fit, { padding: 24, animate: false });
  }, [data, ready]);
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map?.getLayer("fr-hex-selected")) return;
    map.setFilter("fr-hex-selected", ["in", ["get", "h3"], ["literal", selected]]);
  }, [selected, ready]);

  // ---- draw a rectangle ----
  const startDraw = async () => {
    const map = mapRef.current;
    if (!map) return;
    const [{ TerraDraw, TerraDrawRectangleMode }, { TerraDrawMapLibreGLAdapter }] = await Promise.all([
      import("terra-draw"),
      import("terra-draw-maplibre-gl-adapter"),
    ]);
    if (!drawRef.current) {
      const draw = new TerraDraw({
        adapter: new TerraDrawMapLibreGLAdapter({ map }),
        modes: [new TerraDrawRectangleMode()],
      });
      draw.start();
      draw.on("finish", (id) => {
        const f = draw.getSnapshotFeature(id);
        const ring = f?.geometry?.type === "Polygon" ? f.geometry.coordinates[0] : null;
        drawRef.current.drawing = false;
        setDrawing(false);
        setHasDrawn(true);
        draw.setMode("static");
        commit(cellsInPolygon(ring, 5));
      });
      drawRef.current = { draw, drawing: false };
    }
    drawRef.current.draw.clear();
    drawRef.current.draw.setMode("rectangle");
    drawRef.current.drawing = true;
    setDrawing(true);
  };
  const clearDraw = () => {
    drawRef.current?.draw.clear();
    if (drawRef.current) {
      drawRef.current.draw.setMode("static");
      drawRef.current.drawing = false;
    }
    setDrawing(false);
    setHasDrawn(false);
    commit([]);
  };

  const btn = {
    font: "inherit",
    fontSize: CHART_FONT.small,
    padding: "4px 10px",
    borderRadius: "var(--fr-radius-sm)",
    border: "1px solid var(--fr-border)",
    background: "var(--fr-surface)",
    color: "var(--fr-text)",
    cursor: "pointer",
  };
  const empty = (hex?.cells ?? []).length === 0;

  return (
    <div
      style={{ position: "relative", width: "100%" }}
      onKeyDown={(e) => {
        if (e.key === "Escape") setTip(null);
      }}
    >
      <div
        ref={rootRef}
        className="fr-viz"
        role="region"
        aria-label={aria}
        style={{
          width: "100%",
          height: "min(420px, 70vw)",
          minHeight: 260,
          background: "var(--fr-bg)",
          borderRadius: "var(--fr-radius)",
          overflow: "hidden",
        }}
      />
      {tip && (
        <div
          role="status"
          style={{
            position: "absolute",
            left: tip.x + 12,
            top: tip.y + 12,
            maxWidth: 220,
            pointerEvents: "none",
            padding: "6px 8px",
            background: "var(--fr-surface)",
            border: "1px solid var(--fr-border)",
            borderRadius: "var(--fr-radius-sm)",
            color: "var(--fr-text)",
            fontSize: CHART_FONT.small,
          }}
        >
          {isNum(tip.value) ? `${formatNumber(tip.value)} ${unit}` : "No data"}
          <div style={{ color: "var(--fr-muted)", fontSize: CHART_FONT.min }}>
            {METRIC_WORDS[metric]}
            {kind === "estimated" ? ` · ${KIND_STYLE.estimated.label}` : ""}
          </div>
        </div>
      )}
      {empty && (
        <p
          style={{
            position: "absolute",
            inset: "auto 0 12px 0",
            textAlign: "center",
            margin: 0,
            color: "var(--fr-muted)",
            fontSize: CHART_FONT.body,
            pointerEvents: "none",
          }}
        >
          No hexagon data for this region
        </p>
      )}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          alignItems: "center",
          marginTop: 8,
          fontSize: CHART_FONT.small,
          color: "var(--fr-muted)",
        }}
      >
        {drawEnabled && (
          <>
            <button type="button" style={btn} onClick={startDraw} disabled={!ready || drawing}>
              {drawing ? "Drag a rectangle on the map…" : "Draw area"}
            </button>
            <button
              type="button"
              style={btn}
              onClick={clearDraw}
              disabled={!ready || (!hasDrawn && selected.length === 0)}
            >
              Clear
            </button>
          </>
        )}
        <span aria-live="polite">
          {selected.length > 0
            ? `${formatNumber(selected.length)} ${selected.length === 1 ? "hexagon" : "hexagons"} selected`
            : "Click a hexagon to select it"}
        </span>
        {ready && !basemapOn && <span>· Base map unavailable; showing hexagons only</span>}
      </div>
    </div>
  );
});

/** Our sources and layers, on top of whatever style is loaded. Safe to call again after setStyle. */
function addLayers(map, data, selected) {
  if (!map.getSource("fr-hex")) map.addSource("fr-hex", { type: "geojson", data: data.fc });
  if (!map.getSource("fr-outline")) map.addSource("fr-outline", { type: "geojson", data: data.outline });
  const est = data.kind === "estimated";
  if (!map.getLayer("fr-hex-fill"))
    map.addLayer({
      id: "fr-hex-fill",
      type: "fill",
      source: "fr-hex",
      paint: { "fill-color": ["get", "color"], "fill-opacity": est ? KIND_STYLE.estimated.fillOpacity : 0.9 },
    });
  if (!map.getLayer("fr-hex-line"))
    map.addLayer({
      id: "fr-hex-line",
      type: "line",
      source: "fr-hex",
      paint: {
        "line-color": est ? data.colors.estimate : data.colors.edge,
        "line-width": est ? 1 : 0.5,
        ...(est ? { "line-dasharray": [2, 2] } : {}),
      },
    });
  if (!map.getLayer("fr-outline-line"))
    map.addLayer({
      id: "fr-outline-line",
      type: "line",
      source: "fr-outline",
      paint: { "line-color": data.colors.text, "line-width": 1.5 },
    });
  if (!map.getLayer("fr-hex-selected"))
    map.addLayer({
      id: "fr-hex-selected",
      type: "line",
      source: "fr-hex",
      filter: ["in", ["get", "h3"], ["literal", selected]],
      paint: { "line-color": data.colors.accent, "line-width": 2.5 },
    });
}

// ---------------------------------------------------------------------------------------
// Static SVG fallback (no WebGL)
// ---------------------------------------------------------------------------------------

const HexSvg = forwardRef(function HexSvg({ hex, outline, metric, selected, onToggle, aria, note }, ref) {
  const [measureRef, measured] = useElementWidth(640);
  const rootRef = useMemo(() => mergeRefs(ref, measureRef), [ref, measureRef]);
  const W = Math.max(280, measured);
  const H = Math.round(Math.min(420, Math.max(220, W * 0.62)));
  const { fc } = useMemo(() => hexFeatures(hex?.cells, metric), [hex, metric]);
  const fit = bounds(outline?.type ? outline : fc);
  const project = fitProjection(fit, W, H, 12);
  const sel = new Set(selected);
  const est = hex?.kind === "estimated";
  const unit = hex?.unit ?? "";

  return (
    <svg
      ref={rootRef}
      className="fr-viz"
      viewBox={`0 0 ${W} ${H + (note ? 18 : 0)}`}
      width="100%"
      height={H + (note ? 18 : 0)}
      role="group"
      aria-label={aria}
      style={{ display: "block", maxWidth: "100%", background: "var(--fr-bg)" }}
    >
      <VizDefs />
      <g>
        {fc.features.map((f) => (
          <path
            key={f.id}
            d={ringsPath(f.geometry, project)}
            onClick={() => onToggle(f.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onToggle(f.id);
              }
            }}
            tabIndex={0}
            role="button"
            aria-pressed={sel.has(f.id)}
            aria-label={`${isNum(f.properties.value) ? `${formatNumber(f.properties.value)} ${unit}` : "No data"} ${METRIC_WORDS[metric]}`}
            style={{
              fill: f.properties.color,
              fillOpacity: est ? KIND_STYLE.estimated.fillOpacity : 0.9,
              stroke: est ? "var(--fr-estimate-stroke)" : "var(--fr-bg)",
              strokeWidth: est ? 1 : 0.5,
              strokeDasharray: est ? "2 2" : undefined,
              cursor: "pointer",
            }}
          >
            <title>
              {isNum(f.properties.value) ? `${formatNumber(f.properties.value)} ${unit}` : "No data"}{" "}
              {METRIC_WORDS[metric]}
            </title>
          </path>
        ))}
      </g>
      {(outline?.features ?? []).map((f, i) => (
        <path
          key={i}
          d={ringsPath(f.geometry, project)}
          style={{ fill: "none", stroke: "var(--fr-text)", strokeWidth: 1.5 }}
        />
      ))}
      {fc.features
        .filter((f) => sel.has(f.id))
        .map((f) => (
          <path
            key={`s-${f.id}`}
            d={ringsPath(f.geometry, project)}
            pointerEvents="none"
            style={{ fill: "none", stroke: "var(--fr-accent)", strokeWidth: 2.5 }}
          />
        ))}
      {fc.features.length === 0 && (
        <text
          x={W / 2}
          y={H / 2}
          textAnchor="middle"
          style={{ fill: "var(--fr-muted)", fontSize: CHART_FONT.body }}
        >
          No hexagon data for this region
        </text>
      )}
      {note && (
        <text x={8} y={H + 13} style={{ fill: "var(--fr-muted)", fontSize: CHART_FONT.min }}>
          {note}
        </text>
      )}
    </svg>
  );
});

const HexMap = forwardRef(HexMapImpl);
export default HexMap;
