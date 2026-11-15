import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import Brief from "./Brief.jsx";
import { clearFetchCache } from "@/data/fetchJson.js";
import { resetSample } from "@/data/sample.js";
import { mockFetch } from "@/test/mockFetch.js";
import { manifestJson, nowcastJson, regionsJson, trendJson } from "@/test/fixtures.js";

beforeEach(() => {
  clearFetchCache();
  resetSample();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const renderBrief = () =>
  render(
    <MemoryRouter initialEntries={["/r/testland/brief"]}>
      <Routes>
        <Route path="/r/:region/brief" element={<Brief />} />
      </Routes>
    </MemoryRouter>,
  );

const seasonJson = {
  schema_version: "1.0", generated_at: "2026-11-14T00:00:00Z", code_version: "test", region: "testland",
  definition: "The fewest weeks that hold 80% of a typical year's burning", critical_weeks: [42, 43],
  windows: [{ id: "w1", label: "x", start_week: 42, peak_week: 43, end_week: 44, share: 0.7, by_year: [],
    shift_days_per_decade: { start: { value: 0, lo: 0, hi: 0 }, centroid: { value: 0, lo: 0, hi: 0 }, end: { value: 0, lo: 0, hi: 0 } },
    sentence: "Most burning happens from mid-October to mid-November (test)." }],
};

describe("Season Brief", () => {
  it("shows the JSON sentences, the footer and a print button, with no site navigation", async () => {
    mockFetch({
      "regions.json": regionsJson({ files: ["trend", "season", "nowcast"] }),
      "testland/trend.json": trendJson(),
      "testland/season.json": seasonJson,
      "testland/nowcast.json": nowcastJson("above_normal"),
      "manifest.json": { ...manifestJson(false), code_version: "abc1234" },
    });
    const print = vi.fn();
    vi.stubGlobal("print", print);
    renderBrief();
    expect(await screen.findByRole("heading", { level: 1, name: "Testland" })).toBeTruthy();
    await waitFor(() => expect(screen.getByText("Test sentence.")).toBeTruthy());
    expect(screen.getByText("Most burning happens from mid-October to mid-November (test).")).toBeTruthy();
    expect(document.body.textContent).toContain("Nowcast sentence.");
    expect(document.body.textContent).toContain("As of 2026-11-14 12:00 UTC");
    expect(document.body.textContent).toContain("Harmonized values are estimates on the MODIS Aqua scale.");
    await waitFor(() => expect(document.body.textContent).toContain("Code version abc1234"));
    expect(screen.getByRole("link", { name: "NASA FIRMS" })).toBeTruthy();
    expect(screen.queryByRole("navigation")).toBeNull();
    const button = screen.getByRole("button", { name: "Print or save as PDF" });
    expect(button.closest(".no-print")).toBeTruthy();
    await waitFor(() => expect(button.disabled).toBe(false));
    button.click();
    expect(print).toHaveBeenCalledTimes(1);
  });

  it("omits sections whose data are absent and never prints placeholder chart boxes", async () => {
    mockFetch({ "regions.json": regionsJson({ files: ["trend"] }), "testland/trend.json": trendJson() });
    renderBrief();
    await waitFor(() => expect(screen.getByText("Test sentence.")).toBeTruthy());
    expect(screen.queryByText("When it burns")).toBeNull();
    expect(screen.queryByText("This week")).toBeNull();
    expect(screen.queryByText("Where it burns")).toBeNull();
    expect(document.querySelector("[data-viz-placeholder]")).toBeNull();
    expect(screen.getByText("How to read this")).toBeTruthy();
  });
});
