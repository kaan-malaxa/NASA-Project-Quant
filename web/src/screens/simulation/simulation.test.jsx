import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import Simulation from "../Simulation.jsx";
import { clearFetchCache } from "@/data/fetchJson.js";
import { resetSample } from "@/data/sample.js";
import { mockFetch } from "@/test/mockFetch.js";
import { methodsJson, regionsJson, rulerJson, trendJson } from "@/test/fixtures.js";

beforeEach(() => {
  clearFetchCache();
  resetSample();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// regionsJson(): testland (real) and synthland (synthetic); give synthland its files.
const regions = () => {
  const r = regionsJson({ files: [], optional_files: [] });
  r.regions[1] = { ...r.regions[1], files: ["trend", "ruler"], optional_files: [] };
  return r;
};
const trend = () => ({
  ...trendJson(),
  region: "synthland",
  harmonized: { pct_per_decade: 12.459, lo: 11.027, hi: 13.565, direction: "rising" },
});
const planted = [
  { quantity: "trend_pct_per_decade", truth: 12.512, recovered: 12.459, tolerance: 5, pass: true },
  { quantity: "peak_week_main", truth: 44, recovered: 44, tolerance: 1, pass: true },
];
const page = () =>
  render(
    <MemoryRouter initialEntries={["/simulation"]}>
      <TooltipProvider>
        <Simulation />
      </TooltipProvider>
    </MemoryRouter>,
  );

describe("Simulation test page", () => {
  it("renders from the simulated region's JSON: labelled, with the truth compared from the numbers", async () => {
    mockFetch({
      "regions.json": regions(),
      "synthland/trend.json": trend(),
      "synthland/ruler.json": rulerJson(),
      "methods.json": { ...methodsJson([]), planted_truth: planted },
    });
    page();
    expect(screen.getByRole("heading", { name: "Simulation test" })).toBeTruthy();
    expect(screen.getByText(/Synthland is a made-up place/)).toBeTruthy();
    const check = await screen.findByTestId("truth-check");
    await waitFor(() => expect(check.textContent).toContain("so the truth falls inside the likely range"));
    expect(check.textContent).toContain("recovered 2 of 2 planted answers");
    expect(check.textContent).toContain("Main peak week of the season");
    // every part carries the "Simulated data" label
    expect(screen.getAllByTestId("simulated-badge").length).toBeGreaterThanOrEqual(4);
    expect(
      screen.getByRole("link", { name: /See the full Synthland region page/ }).getAttribute("href"),
    ).toBe("/r/synthland?debug=1");
    expect(screen.getByRole("link", { name: "How the test works" }).getAttribute("href")).toBe("/methods");
  });

  it("without a planted trend in the JSON, shows the result without a comparison (nothing invented)", async () => {
    mockFetch({
      "regions.json": regions(),
      "synthland/trend.json": trend(),
      "synthland/ruler.json": rulerJson(),
      "methods.json": methodsJson([]),
    });
    page();
    const check = await screen.findByTestId("truth-check");
    await waitFor(() => expect(check.textContent).toContain("no planted true trend"));
    expect(check.textContent).not.toContain("inside the likely range");
  });

  it("says so when the data has no simulated region", async () => {
    const r = regionsJson();
    r.regions = r.regions.filter((x) => !x.synthetic);
    mockFetch({ "regions.json": r, "methods.json": methodsJson([]) });
    page();
    expect(await screen.findByText("There is no simulated region in this build of the data.")).toBeTruthy();
  });
});
