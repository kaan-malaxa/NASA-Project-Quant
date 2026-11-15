/**
 * Region outline (GeoJSON) -> SVG path with a simple equirectangular projection:
 * x = lon * cos(mid-latitude), y = -lat, scaled to fit width x height with padding, centred. No map library.
 */

function rings(geojson) {
  const out = [];
  const features = geojson?.type === "FeatureCollection" ? geojson.features : geojson ? [geojson] : [];
  for (const f of features) {
    const g = f?.type === "Feature" ? f.geometry : f;
    if (!g) continue;
    if (g.type === "Polygon") out.push(...g.coordinates);
    else if (g.type === "MultiPolygon") for (const poly of g.coordinates) out.push(...poly);
  }
  return out.filter((r) => Array.isArray(r) && r.length >= 3);
}

const r2 = (v) => Math.round(v * 100) / 100;

/**
 * @param {object} geojson FeatureCollection, Feature or geometry (Polygon / MultiPolygon)
 * @returns {{ d: string, width: number, height: number } | null}
 */
export function outlinePath(geojson, width = 120, height = 90, pad = 4) {
  const rs = rings(geojson);
  if (!rs.length) return null;
  let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const ring of rs) {
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
  const d = rs
    .map(
      (ring) =>
        ring
          .map(([lon, lat], i) => `${i ? "L" : "M"}${r2(offX + (lon - minLon) * kx * scale)},${r2(offY + (maxLat - lat) * scale)}`)
          .join("") + "Z",
    )
    .join("");
  return { d, width, height };
}
