// @vitest-environment jsdom
// D2: HexMap helpers (known answers) and the no-WebGL SVG fallback (jsdom has no WebGL).
import { cleanup, fireEvent, render } from "@testing-library/react";
import { createRef } from "react";
import { cellToLatLng, getResolution, latLngToCell } from "h3-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import HexMap from "../HexMap";
import {
  bounds,
  cellsInPolygon,
  fitProjection,
  hexColorScale,
  hexFeatures,
  ringsPath,
  toggleCell,
} from "../hexLayout";
import { ZERO_FILL } from "../theme";

afterEach(cleanup);

const A = latLngToCell(30.9, 75.8, 5);
const B = latLngToCell(31.5, 76.4, 5);
const HEX = {
  region: "test",
  resolution: 5,
  unit: "VIIRS fire cell-days per year",
  source: "snpp",
  years: [2013, 2025],
  kind: "observed",
  cells: [
    { h3: A, critical: 10, all_year: 20 },
    { h3: B, critical: 0, all_year: 4 },
    { h3: "not-a-cell", critical: 5, all_year: 5 },
  ],
};

describe("hexLayout", () => {
  it("hexFeatures: one closed GeoJSON polygon per valid cell, metric as value", () => {
    const { fc, skipped } = hexFeatures(HEX.cells, "critical");
    expect(skipped).toBe(1);
    expect(fc.features.map((f) => f.properties.h3)).toEqual([A, B]);
    expect(fc.features[0].properties.value).toBe(10);
    const ring = fc.features[0].geometry.coordinates[0];
    expect(ring[0]).toEqual(ring[ring.length - 1]); // GeoJSON rings are closed
    const [lat, lng] = cellToLatLng(A);
    expect(Math.abs(ring[0][0] - lng)).toBeLessThan(0.5); // [lng, lat] order
    expect(Math.abs(ring[0][1] - lat)).toBeLessThan(0.5);
  });

  it("hexColorScale: zero keeps the zero colour, at most HEX_STEPS colours", () => {
    const vals = Array.from({ length: 101 }, (_, i) => i);
    const { color } = hexColorScale(vals);
    expect(color(0)).toBe(ZERO_FILL);
    const distinct = new Set(vals.filter((v) => v > 0).map(color));
    expect(distinct.size).toBeLessThanOrEqual(7);
    expect(distinct.size).toBeGreaterThan(3);
    expect(color(1)).not.toBe(color(100));
  });

  it("cellsInPolygon: a small rectangle around a cell's centre selects that res-5 cell", () => {
    const [lat, lng] = cellToLatLng(A);
    const d = 0.02;
    const ring = [
      [lng - d, lat - d],
      [lng + d, lat - d],
      [lng + d, lat + d],
      [lng - d, lat + d],
      [lng - d, lat - d],
    ];
    const got = cellsInPolygon(ring, 5);
    expect(got).toEqual([A]);
    expect(getResolution(got[0])).toBe(5);
    expect(cellsInPolygon(null)).toEqual([]);
  });

  it("toggleCell adds and removes", () => {
    expect(toggleCell([], A)).toEqual([A]);
    expect(toggleCell([A, B].sort(), A)).toEqual([B]);
  });

  it("bounds and fitProjection keep shapes inside the box", () => {
    const b = bounds({
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [10, 0],
          [10, 5],
          [0, 5],
          [0, 0],
        ],
      ],
    });
    expect(b).toEqual([
      [0, 0],
      [10, 5],
    ]);
    const p = fitProjection(b, 200, 100, 0);
    for (const pt of [
      [0, 0],
      [10, 5],
      [5, 2.5],
    ]) {
      const [x, y] = p(pt);
      expect(x).toBeGreaterThanOrEqual(-1e-9);
      expect(x).toBeLessThanOrEqual(200 + 1e-9);
      expect(y).toBeGreaterThanOrEqual(-1e-9);
      expect(y).toBeLessThanOrEqual(100 + 1e-9);
    }
    expect(p([0, 5])[1]).toBeCloseTo(0); // north is up
    expect(
      ringsPath(
        {
          type: "Polygon",
          coordinates: [
            [
              [0, 0],
              [10, 0],
              [0, 0],
            ],
          ],
        },
        p,
      ),
    ).toMatch(/^M.*Z$/);
    expect(bounds({ type: "FeatureCollection", features: [] })).toBeNull();
  });
});

describe("HexMap without WebGL", () => {
  it("draws an SVG of the hexagons, forwards the ref, click toggles and reports", () => {
    const ref = createRef();
    const onAoi = vi.fn();
    const { container } = render(<HexMap ref={ref} hex={HEX} metric="critical" onAoiChange={onAoi} />);
    expect(ref.current.tagName.toLowerCase()).toBe("svg");
    const hexes = [...container.querySelectorAll("svg path")].filter((p) => p.querySelector("title"));
    expect(hexes.length).toBe(2);
    expect(hexes[0].querySelector("title").textContent).toContain("10 VIIRS fire cell-days per year");
    fireEvent.click(hexes[0]);
    expect(onAoi).toHaveBeenLastCalledWith([A]);
    fireEvent.click(container.querySelectorAll("svg path")[0]);
    expect(onAoi).toHaveBeenLastCalledWith([]);
    expect(container.querySelector("div.fr-sr-only table")).not.toBeNull();
  });

  it("selectedCells are outlined; empty data says so", () => {
    const sel = render(<HexMap hex={HEX} metric="all_year" selectedCells={[B]} />);
    const outlined = [...sel.container.querySelectorAll("svg path")].filter((p) =>
      p.style.stroke.includes("fr-accent"),
    );
    expect(outlined.length).toBe(1);
    cleanup();
    const empty = render(<HexMap hex={{ ...HEX, cells: [] }} metric="critical" />);
    expect(empty.container.textContent).toContain("No hexagon data for this region");
  });
});
