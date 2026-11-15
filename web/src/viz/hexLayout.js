// Pure helpers for HexMap (prompt D2, spec §9.8). Imported only by HexMap.jsx, which is lazy-loaded,
// so h3-js stays out of the main bundle. Unit-tested in __tests__/hexmap.test.js.

import { cellToBoundary, cellToLatLng, isValidCell, polygonToCells } from "h3-js";
import { activityDomainMax, activityScale } from "./theme";

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

/** Number of colour steps on the map ("activityScale steps"). */
export const HEX_STEPS = 7;

/**
 * Stepped activity colour: the value is rounded UP to the next of HEX_STEPS equal steps of [0, max],
 * then coloured with activityScale. Exactly 0 keeps the zero colour; non-numbers are no data.
 */
export function hexColorScale(values) {
  const max = activityDomainMax(values);
  const scale = activityScale(max);
  const color = (v) => {
    if (!isNum(v)) return scale(NaN);
    if (v <= 0) return scale(0);
    const step = Math.min(HEX_STEPS, Math.ceil((v / max) * HEX_STEPS));
    return scale((step / HEX_STEPS) * max);
  };
  return { max, color };
}

/**
 * GeoJSON FeatureCollection of hexagons (GeoJSON [lng, lat] order, closed rings) with the chosen metric
 * as `value` and its stepped colour as `color`. Invalid indexes are skipped and counted.
 */
export function hexFeatures(cells, metric, resolveColor = (c) => c) {
  const valid = (cells ?? []).filter((c) => typeof c?.h3 === "string" && isValidCell(c.h3));
  const { max, color } = hexColorScale(valid.map((c) => c[metric]));
  const features = valid.map((c) => {
    const ring = cellToBoundary(c.h3, true);
    const value = isNum(c[metric]) ? c[metric] : null;
    return {
      type: "Feature",
      id: c.h3,
      properties: { h3: c.h3, value, color: resolveColor(color(value)) },
      geometry: { type: "Polygon", coordinates: [ring] },
    };
  });
  return { fc: { type: "FeatureCollection", features }, max, skipped: (cells?.length ?? 0) - valid.length };
}

/** Every [lng, lat] position in a GeoJSON geometry, feature or collection. */
export function positions(geo) {
  const out = [];
  const walk = (c) => {
    if (!Array.isArray(c)) return;
    if (typeof c[0] === "number") out.push(c);
    else c.forEach(walk);
  };
  const visit = (g) => {
    if (!g) return;
    if (g.type === "FeatureCollection") g.features?.forEach(visit);
    else if (g.type === "Feature") visit(g.geometry);
    else if (g.type === "GeometryCollection") g.geometries?.forEach(visit);
    else walk(g.coordinates);
  };
  visit(geo);
  return out;
}

/** [[west, south], [east, north]] of a GeoJSON object, or null when it has no positions. */
export function bounds(geo) {
  const pts = positions(geo);
  if (pts.length === 0) return null;
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (const [x, y] of pts) {
    if (x < w) w = x;
    if (x > e) e = x;
    if (y < s) s = y;
    if (y > n) n = y;
  }
  return [
    [w, s],
    [e, n],
  ];
}

/** Res-5 cells whose centre is inside a drawn polygon ring ([lng, lat], GeoJSON order). Sorted. */
export function cellsInPolygon(ring, res = 5) {
  if (!Array.isArray(ring) || ring.length < 4) return [];
  return polygonToCells([ring], res, true).sort();
}

/** Add or remove one cell from a selection; returns a new sorted array. */
export function toggleCell(selected, h3) {
  const set = new Set(selected ?? []);
  if (set.has(h3)) set.delete(h3);
  else set.add(h3);
  return [...set].sort();
}

/** Centre of a cell as [lng, lat]. */
export function cellCenter(h3) {
  const [lat, lng] = cellToLatLng(h3);
  return [lng, lat];
}

/**
 * Simple equirectangular projection fitted to a bounding box, for the no-WebGL SVG fallback.
 * x is scaled by cos(mid-latitude) so shapes are not stretched. Winding-order independent.
 */
export function fitProjection(bbox, width, height, pad = 8) {
  if (!bbox) return () => [width / 2, height / 2];
  const [[w, s], [e, n]] = bbox;
  const k = Math.cos((((s + n) / 2) * Math.PI) / 180);
  const spanX = Math.max(1e-9, (e - w) * k);
  const spanY = Math.max(1e-9, n - s);
  const scale = Math.min((width - 2 * pad) / spanX, (height - 2 * pad) / spanY);
  const ox = (width - spanX * scale) / 2;
  const oy = (height - spanY * scale) / 2;
  return ([lng, lat]) => [ox + (lng - w) * k * scale, oy + (n - lat) * scale];
}

/** SVG path for every ring of a (Multi)Polygon geometry, with a projection from fitProjection. */
export function ringsPath(geometry, project) {
  if (!geometry) return "";
  const polys =
    geometry.type === "Polygon"
      ? [geometry.coordinates]
      : geometry.type === "MultiPolygon"
        ? geometry.coordinates
        : [];
  return polys
    .flatMap((poly) =>
      poly.map(
        (ring) =>
          ring
            .map((p, i) => {
              const [x, y] = project(p);
              return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
            })
            .join("") + "Z",
      ),
    )
    .join("");
}
