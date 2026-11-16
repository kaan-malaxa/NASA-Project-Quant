import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { clearThumbCache, useOutlineThumb } from "./outlineThumbs.js";
import { clearFetchCache } from "./fetchJson.js";

function Probe({ region, near }) {
  const s = useOutlineThumb(region, near);
  return <p data-testid="probe">{s.status === "ok" ? s.thumb.d.slice(0, 1) : s.status}</p>;
}
const region = { id: "testland", files: ["outline"] };
// A valid outline.geojson (it is checked against its schema when fetched).
const outline = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: {},
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
            [0, 0],
          ],
        ],
      },
    },
  ],
};

beforeEach(() => {
  clearFetchCache();
  clearThumbCache();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const stubFetch = (thumbs, withOutline = true) => {
  const fn = vi.fn(async (url) => {
    const u = String(url);
    if (u.endsWith("outline-thumbs.json")) {
      return thumbs
        ? new Response(JSON.stringify({ regions: thumbs }), {
            headers: { "content-type": "application/json" },
          })
        : new Response("no", { status: 404 });
    }
    if (withOutline && u.endsWith("testland/outline.geojson")) {
      return new Response(JSON.stringify(outline), { headers: { "content-type": "application/json" } });
    }
    return new Response("no", { status: 404 });
  });
  vi.stubGlobal("fetch", fn);
  return fn;
};

describe("useOutlineThumb", () => {
  it("uses the build-time thumbnail and never downloads the full outline", async () => {
    const fn = stubFetch({ testland: { d: "M1,1L2,2Z", width: 96, height: 72 } });
    render(<Probe region={region} near />);
    await waitFor(() => expect(screen.getByTestId("probe").textContent).toBe("M"));
    expect(fn.mock.calls.some(([u]) => String(u).endsWith("outline.geojson"))).toBe(false);
  });

  it("falls back to the outline only when the card is near the viewport, then caches it for the session", async () => {
    const fn = stubFetch(null);
    const { rerender } = render(<Probe region={region} near={false} />);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByTestId("probe").textContent).toBe("loading");
    expect(fn.mock.calls.some(([u]) => String(u).endsWith("outline.geojson"))).toBe(false);
    rerender(<Probe region={region} near />);
    await waitFor(() => expect(screen.getByTestId("probe").textContent).toBe("M"));
    expect(sessionStorage.getItem("pt-outline-thumbs-v1")).toContain("testland");
  });

  it("is absent when the region lists no outline", () => {
    stubFetch({});
    render(<Probe region={{ id: "x", files: [] }} near />);
    expect(screen.getByTestId("probe").textContent).toBe("absent");
  });
});
