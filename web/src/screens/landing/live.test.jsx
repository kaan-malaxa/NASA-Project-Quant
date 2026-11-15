import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import LiveThisWeek from "./LiveThisWeek.jsx";
import { liveRegion } from "./liveRegion.js";
import { clearFetchCache } from "@/data/fetchJson.js";
import { resetSample } from "@/data/sample.js";
import { mockFetch } from "@/test/mockFetch.js";
import { nowcastJson, regionsJson, trendJson, weeklyJson } from "@/test/fixtures.js";

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

  describe("no recent satellite data: the latest year in the record", () => {
    // testland: last_data_day 2026-11-13, so the latest complete year is 2025 (from JSON, not typed here).
    const list = regionsJson({ files: ["nowcast", "trend", "weekly"], optional_files: [] }).regions;
    const id = liveRegion(list).id;
    const trend = () => ({
      ...trendJson(),
      annual: [2023, 2024, 2025].map((year, i) => ({
        year,
        harmonized: [100, 300, 250][i],
        lo: [90, 280, 230][i],
        hi: [110, 320, 270][i],
        kind: "harmonized",
        naive_count: 1,
        naive_source: "snpp",
      })),
    });
    const weekly = () => ({
      ...weeklyJson(),
      rows: [
        {
          year: 2025,
          week: 1,
          series: "harmonized",
          value: 4,
          lo: 4,
          hi: 4,
          kind: "harmonized",
          source: "snpp",
        },
        {
          year: 2025,
          week: 2,
          series: "harmonized",
          value: 6,
          lo: 6,
          hi: 6,
          kind: "harmonized",
          source: "snpp",
        },
      ],
    });
    const unavailable = () => ({ ...nowcastJson("unavailable"), sentence: "No recent satellite data." });

    it("shows that year's harmonized value with its range and kind, and the other baseline years' median", async () => {
      mockFetch({
        [`${id}/nowcast.json`]: unavailable(),
        [`${id}/trend.json`]: trend(),
        [`${id}/weekly.json`]: weekly(),
      });
      renderLive(list);
      const card = await screen.findByTestId("latest-year");
      await waitFor(() => expect(card.textContent).toContain("Latest year in the record: 2025"));
      expect(card.textContent).toContain("No recent satellite data.");
      expect(card.textContent).toContain("250"); // 2025's harmonized value
      expect(card.textContent).toContain("230 to 270");
      expect(card.textContent).toContain("Harmonized"); // kind badge
      // baseline 2003-2025 includes 2025, so it is left out: median of 100 and 300
      expect(card.textContent).toContain("median of the other baseline years, 2003 to 2025");
      expect(card.textContent).toContain("200");
      expect(screen.getByRole("img", { name: /2 weeks with data, 50 without/ })).toBeTruthy();
      expect(screen.getByRole("link", { name: "See the full picture" }).getAttribute("href")).toBe(
        `/r/${id}`,
      );
      expect(screen.queryByText("Live this week")).toBeNull();
    });

    it("keeps the live card when the nowcast has a real status", async () => {
      mockFetch({ [`${id}/nowcast.json`]: nowcastJson("normal") });
      renderLive(list);
      await waitFor(() => expect(screen.getByText("Live this week")).toBeTruthy());
      expect(screen.queryByTestId("latest-year")).toBeNull();
    });

    it("hides the section when trend.json or weekly.json is missing", async () => {
      vi.spyOn(console, "info").mockImplementation(() => {});
      mockFetch({ [`${id}/nowcast.json`]: unavailable(), [`${id}/weekly.json`]: weekly() });
      const { container } = renderLive(list);
      await waitFor(() => expect(container.textContent).toBe(""));
    });
  });
});
