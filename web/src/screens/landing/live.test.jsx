import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import LiveThisWeek from "./LiveThisWeek.jsx";
import { liveRegion } from "./liveRegion.js";
import { clearFetchCache } from "@/data/fetchJson.js";
import { resetSample } from "@/data/sample.js";
import { mockFetch } from "@/test/mockFetch.js";
import { nowcastJson, regionsJson } from "@/test/fixtures.js";

beforeEach(() => {
  clearFetchCache();
  resetSample();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const regions = () => regionsJson({ files: ["nowcast"], optional_files: [] }).regions;
const renderLive = (list = regions()) =>
  render(
    <MemoryRouter>
      <TooltipProvider>
        <LiveThisWeek regions={list} />
      </TooltipProvider>
    </MemoryRouter>,
  );

describe("liveRegion", () => {
  it("takes the first region with synthetic: false and a nowcast, skipping synthetic ones", () => {
    const list = [
      { id: "synthland", synthetic: true, files: ["nowcast"] },
      { id: "nofile", synthetic: false, files: ["weekly"] },
      { id: "us", synthetic: false, files: ["nowcast"] },
      { id: "later", synthetic: false, files: ["nowcast"] },
    ];
    expect(liveRegion(list).id).toBe("us");
    expect(liveRegion([{ id: "synthland", synthetic: true, files: ["nowcast"] }])).toBeNull();
    expect(liveRegion(undefined)).toBeNull();
  });
});

describe("LiveThisWeek", () => {
  it("normal week: status sentence, the percentile strip, as-of, month-to-date, a kind badge and the link", async () => {
    const list = regions();
    const id = liveRegion(list).id;
    mockFetch({ [`${id}/nowcast.json`]: nowcastJson("above_normal") });
    renderLive(list);
    const body = await screen.findByTestId("live-body");
    await waitFor(() => expect(body.querySelector('[data-layout="ranked"]')).not.toBeNull());
    expect(screen.getByText("Live this week")).toBeTruthy();
    expect(screen.getByRole("heading", { name: liveRegion(list).name })).toBeTruthy();
    expect(body.textContent).toContain("Above normal");
    expect(
      body.querySelector('[data-viz-placeholder="PercentileStrip"], svg, [aria-label*="PercentileStrip"]'),
    ).not.toBeNull();
    expect(screen.getByRole("link", { name: "See the full picture" }).getAttribute("href")).toBe(`/r/${id}`);
  });

  it("low activity: the region page's own wording", async () => {
    const list = regions();
    mockFetch({ [`${liveRegion(list).id}/nowcast.json`]: nowcastJson("low_activity") });
    renderLive(list);
    await waitFor(() =>
      expect(screen.getByText("Too little burning at this time of year to rank.")).toBeTruthy(),
    );
    expect(document.querySelector('[data-layout="low_activity"]')).not.toBeNull();
  });

  it("hides the whole section when nowcast.json is missing or fails validation", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const list = regions();
    mockFetch({}); // not on the server
    const { container } = renderLive(list);
    await waitFor(() => expect(info).toHaveBeenCalled());
    expect(container.textContent).toBe("");

    cleanup();
    clearFetchCache();
    mockFetch({ [`${liveRegion(list).id}/nowcast.json`]: { status: "nonsense" } });
    const again = renderLive(list);
    await waitFor(() => expect(again.container.textContent).toBe(""));
    expect(screen.queryByText("This file failed validation.")).toBeNull();
  });

  it("shows nothing without a non-synthetic region", () => {
    const { container } = renderLive([{ id: "synthland", synthetic: true, files: ["nowcast"] }]);
    expect(container.textContent).toBe("");
  });
});
