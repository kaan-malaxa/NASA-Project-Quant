/**
 * Small region outlines for the place picker: a GeoJSON outline -> one short SVG path, sized for a card thumbnail.
 * No imports, so the same code runs in the browser and in the build step that precomputes every region's thumbnail
 * (vite.config.js, outline-thumbs.json). The picker never downloads a full outline when a thumbnail exists.
 *
 * Projection: equirectangular, x = lon * cos(mid-latitude). Regions that cross the date line (the US: Alaska's
 * Aleutians) are unwrapped around the widest gap in longitude, as R6's map does (display only).
 * Simplification: points closer than `tolerance` px to the last kept point are dropped, and rings smaller than about a
 * pixel are left out, so a multi-megabyte outline becomes a path of a few kB that looks the same at thumbnail size.
 */

/** Every ring of a FeatureCollection / Feature / Polygon / MultiPolygon. */
export function outlineRings(geojson) {
  const out = [];
  const visit = (g) => {
    if (!g) return;
    if (g.type === "FeatureCollection") (g.features || []).forEach(visit);
    else if (g.type === "Feature") visit(g.geometry);
    else if (g.type === "GeometryCollection") (g.geometries || []).forEach(visit);
    else if (g.type === "Polygon") out.push(...(g.coordinates || []));
    else if (g.type === "MultiPolygon") for (const poly of g.coordinates || []) out.push(...poly);
  };
  visit(geojson);
  return out.filter((r) => Array.isArray(r) && r.length >= 3);
}

/** The longitude where the outline starts, past the widest empty gap (so a date-line crossing stays in one piece). */
export function unwrapCentre(rings) {
  const lons = [...new Set(rings.flat().map(([x]) => ((x % 360) + 360) % 360))].sort((a, b) => a - b);
  if (!lons.length) return 0;
  let gap = -1;
  let start = lons[0];
  for (let i = 0; i < lons.length; i++) {
    const next = i + 1 === lons.length ? lons[0] + 360 : lons[i + 1];
    if (next - lons[i] > gap) {
      gap = next - lons[i];
      start = next % 360;
    }
  }
  let centre = start + (360 - gap) / 2;
  if (centre > 180) centre -= 360;
  return centre;
}

const r1 = (v) => Math.round(v * 10) / 10;

/**
 * @param {object} geojson the region's outline.geojson
 * @returns {{ d: string, width: number, height: number } | null}
 */
export function outlineThumb(geojson, width = 96, height = 72, pad = 3, tolerance = 0.6) {
  const raw = outlineRings(geojson);
  if (!raw.length) return null;
  const centre = unwrapCentre(raw);
  const rings = raw.map((ring) =>
    ring.map(([lon, lat]) => [lon + 360 * Math.round((centre - lon) / 360), lat]),
  );
  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const ring of rings) {
    for (const [lon, lat] of ring) {
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  }
  const kx = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
  const spanX = (maxLon - minLon) * kx || 1e-9;
  const spanY = maxLat - minLat || 1e-9;
  const scale = Math.min((width - 2 * pad) / spanX, (height - 2 * pad) / spanY);
  const offX = (width - spanX * scale) / 2;
  const offY = (height - spanY * scale) / 2;
  const parts = [];
  for (const ring of rings) {
    const pts = [];
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [lon, lat] of ring) {
      const x = offX + (lon - minLon) * kx * scale;
      const y = offY + (maxLat - lat) * scale;
      const last = pts[pts.length - 1];
      if (!last || Math.hypot(x - last[0], y - last[1]) >= tolerance) pts.push([x, y]);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    if (pts.length < 3 || (maxX - minX) * (maxY - minY) < 1) continue; // smaller than about a pixel
    parts.push(pts.map(([x, y], i) => `${i ? "L" : "M"}${r1(x)},${r1(y)}`).join("") + "Z");
  }
  if (!parts.length) return null;
  return { d: parts.join(""), width, height };
}
