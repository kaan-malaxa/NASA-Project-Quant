import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import Methods from "../Methods.jsx";
import { clearFetchCache } from "@/data/fetchJson.js";
import { resetSample } from "@/data/sample.js";
import { mockFetch } from "@/test/mockFetch.js";
import { manifestJson, methodsJson, regionsJson } from "@/test/fixtures.js";

beforeEach(() => {
  clearFetchCache();
  resetSample();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const renderMethods = () =>
  render(
    <MemoryRouter>
      <TooltipProvider>
        <Methods />
      </TooltipProvider>
    </MemoryRouter>,
  );

function fullMethods() {
  const m = methodsJson([{ claim_id: "snpp_end", text: "Claim text.", url: "https://example.org/x", checked: "2026-11-14" }]);
  return {
    ...m,
    validation: [
      { region: "testland", test: "loyo_weekly_wape", method: "tier1", value: 0.2, baselines: { raw_viirs: 0.9, annual_ratio: 0.15 }, n: 520, years: [2013, 2022], note: "" },
      { region: "testland", test: "handoff_annual_mape", method: "tier1", value: 0.05, n: 10, years: [2013, 2022], note: "A note." },
    ],
    drift: [{ region: "testland", sensor: "snpp", year: 2013, k_annual: 0.5, lo: 0.45, hi: 0.55 }],
    eyesight: [
      {
        region: "testland", status: "exploratory",
        params: { a: -1, b: 2, c: 0.8, a_lo: -1.1, a_hi: -0.9, b_lo: 1.9, b_hi: 2.1, c_lo: 0.7, c_hi: 0.9 },
        g: 1.1, n_celldays: 1000, curve: [{ frp_mw: 1, p: 0.2, lo: 0.1, hi: 0.3 }, { frp_mw: 10, p: 0.6, lo: 0.5, hi: 0.7 }],
        binned: [{ frp_mw: 1, p_obs: 0.2, n: 500 }, { frp_mw: 10, p_obs: 0.6, n: 500 }],
        k_compare: [{ month: 1, k_tier1: 0.5, k_tier2: 0.6 }],
      },
      { region: "synthland", status: "absent" },
    ],
    planted_truth: [
      { quantity: "k_annual_snpp", truth: 0.5, recovered: 0.49, tolerance: 0.03, pass: true },
      { quantity: "trend", truth: 1, recovered: 2, tolerance: 0.1, pass: false },
    ],
    inputs: [{ source: "MODIS_SP", region: "testland", rows: 12345, first_date: "2003-01-01", last_date: "2022-12-31", downloaded: "2026-11-14", via: "archive" }],
    filters: [{ region: "testland", sensor: "aqua", step: "confidence", rows_in: 100, rows_dropped: 7 }],
    limitations: ["Limitation one."],
    ai_use: "AI use text.",
  };
}

const calibration = {
  schema_version: "1.0", generated_at: "2026-11-14T00:00:00Z", code_version: "test", region: "testland", reference: "aqua_day",
  count_resolution: 6, shrinkage_n0: 50,
  eras: [
    { from: "2003-01-01", to: "2022-12-31", source: "aqua", kind: "observed" },
    { from: "2023-01-01", to: null, source: "snpp", kind: "harmonized" },
  ],
  fit_window: { snpp: ["2013-01-01", "2022-12-31"], noaa20: ["2018-01-01", "2022-12-31"] }, noaa20_method: "direct",
  k_annual: { snpp: { k: 0.5, lo: 0.4, hi: 0.6 }, noaa20: { k: 0.5, lo: 0.4, hi: 0.6 } }, k: { snpp: [], noaa20: [] },
};

const section = (name) => screen.getByRole("region", { name });

describe("Methods page", () => {
  it("does not request numbers_audit.md when the manifest does not list it", async () => {
    const fetchSpy = mockFetch({ "methods.json": fullMethods(), "manifest.json": manifestJson(false), "regions.json": regionsJson({ files: [] }) });
    renderMethods();
    await screen.findByRole("region", { name: "Tested on a world where we know the answer" });
    await waitFor(() => expect(fetchSpy.mock.calls.some(([u]) => String(u).endsWith("manifest.json"))).toBe(true));
    await new Promise((r) => setTimeout(r, 50));
    expect(fetchSpy.mock.calls.some(([u]) => String(u).includes("numbers_audit.md"))).toBe(false);
    expect(screen.queryByRole("link", { name: "numbers audit" })).toBeNull();
  });

  it("renders all seven parts from methods.json", async () => {
    mockFetch({
      "methods.json": fullMethods(),
      "manifest.json": { ...manifestJson(false), files: [{ path: "numbers_audit.md", sha256: "0".repeat(64), bytes: 8, kinds: [] }] },
      "regions.json": regionsJson({ files: ["calibration"] }),
      "testland/calibration.json": calibration,
      "numbers_audit.md": "# audit",
    });
    renderMethods();
    await screen.findByRole("region", { name: "What we did, in five steps" });
    expect(section("What we did, in five steps").textContent).toContain("H3 resolution 6");
    expect(section("What we did, in five steps").textContent).toContain("2022-12-31");

    await waitFor(() => expect(section("The ruler was bending").textContent).toContain("MODIS Aqua"));
    expect(section("The ruler was bending").textContent).toContain("today");

    const v = section("Does the translation work?");
    expect(v.textContent).toContain("Weekly error with each year held out (WAPE)");
    expect(v.textContent).toContain("Ours is not lower than: One factor for the whole year");
    expect(v.textContent).toContain("match partly by construction");

    const p = section("Tested on a world where we know the answer");
    expect(within(p).getByText("Pass")).toBeTruthy();
    expect(within(p).getByText("Fail")).toBeTruthy();
    await waitFor(() => expect(within(p).getByRole("link", { name: "numbers audit" })).toBeTruthy());

    const e = section("How well did the old satellite see?");
    expect(e.textContent).toContain("Exploratory");
    expect(e.textContent).toContain("Not available");
    // R6's EyesightCurve draws the exploratory curve; the "absent" region gets text only, and no placeholder remains.
    expect(e.querySelectorAll('[data-viz-placeholder="EyesightCurve"]')).toHaveLength(0);
    expect(e.querySelectorAll("svg.fr-viz")).toHaveLength(1);

    const d = section("Data");
    expect(d.textContent).toContain("12,345");
    expect(d.textContent).toContain("checked 2026-11-14");
    expect(section("Limitations").textContent).toContain("Limitation one.");
    expect(section("How we used AI").textContent).toContain("AI use text.");
    expect(section("Credits").textContent).toContain("Not affiliated with or endorsed by NASA.");
  });

  it("hides every missing part and keeps the credits", async () => {
    const bare = { schema_version: "1.0", generated_at: "x", code_version: "test" };
    mockFetch({ "methods.json": bare, "regions.json": regionsJson({ files: [] }) });
    renderMethods();
    await waitFor(() => expect(screen.getByRole("region", { name: "Credits" })).toBeTruthy());
    for (const t of ["What we did, in five steps", "Does the translation work?", "Tested on a world where we know the answer", "How well did the old satellite see?", "Data", "Limitations"]) {
      expect(screen.queryByRole("region", { name: t }), t).toBeNull();
    }
  });

  it("explains a missing methods file and still shows the credits", async () => {
    mockFetch({});
    renderMethods();
    await waitFor(() => expect(screen.getByText(/Not available for this region yet|could not be loaded/)).toBeTruthy());
    expect(screen.getByRole("region", { name: "Credits" })).toBeTruthy();
  });
});
