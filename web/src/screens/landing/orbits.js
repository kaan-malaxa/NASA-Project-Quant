/**
 * Orbit geometry for the landing globe (a drawing, not a simulation). Scene units: Earth radius = 1, +y = north pole.
 */
const RAD = Math.PI / 180;

/**
 * A point on a circular orbit.
 * @param {number} radius distance from the Earth's centre
 * @param {number} inclinationDeg tilt of the orbit plane from the equator (about 98 = near-polar, sun-synchronous)
 * @param {number} raanDeg rotation of the orbit plane around the polar axis
 * @param {number} angle position along the orbit, radians from the equator crossing
 * @returns {[number, number, number]}
 */
export function orbitPoint(radius, inclinationDeg, raanDeg, angle) {
  const i = inclinationDeg * RAD;
  const o = raanDeg * RAD;
  // In the orbit plane, then tilt about x by the inclination, then turn about y by the plane angle.
  const px = radius * Math.cos(angle);
  const py = radius * Math.sin(angle) * Math.sin(i);
  const pz = radius * Math.sin(angle) * Math.cos(i);
  return [px * Math.cos(o) + pz * Math.sin(o), py, -px * Math.sin(o) + pz * Math.cos(o)];
}

/** The closed ring of points that draws one orbit line. */
export function orbitRing(radius, inclinationDeg, raanDeg, segments = 128) {
  const pts = [];
  for (let s = 0; s <= segments; s++)
    pts.push(orbitPoint(radius, inclinationDeg, raanDeg, (s / segments) * 2 * Math.PI));
  return pts;
}

/** Camera distance that keeps a sphere of `fitRadius` inside a view of the given vertical field of view and aspect. */
export function cameraDistance(fitRadius, fovDeg, aspect) {
  const t = Math.tan((fovDeg * RAD) / 2);
  return fitRadius / (t * Math.min(1, aspect));
}
