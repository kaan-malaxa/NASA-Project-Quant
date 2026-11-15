import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import Region from "../Region.jsx";
import { monthToDateLine } from "./ThisWeekSection.jsx";
import { clearFetchCache } from "@/data/fetchJson.js";
import { resetSample } from "@/data/sample.js";
import { mockFetch } from "@/test/mockFetch.js";
import { climatologyJson, dailyJson, nowcastJson, regionsJson, trendJson, weeklyFullJson } from "@/test/fixtures.js";

beforeEach(() => {
  clearFetchCache();
  resetSample();
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

let currentSearch = "";
function LocationSpy() {
  currentSearch = useLocation().search;
  return null;
}

function renderRegion(path = "/r/testland") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <TooltipProvider>
        <Routes>
          <Route path="/r/:region" element={<><Region /><LocationSpy /></>} />
        </Routes>
      </TooltipProvider>
    </MemoryRouter>,
  );
}

const files = { files: ["weekly", "climatology", "trend", "nowcast", "season"], optional_files: [] };

describe("Region page", () => {
  it("renders the story with a missing trend file and a missing season file", async () => {
    mockFetch({
      "regions.json": regionsJson(files),
      "testland/weekly.json": weeklyFullJson(),
      "testland/climatology.json": climatologyJson(),
      "testland/nowcast.json": nowcastJson("above_normal"),
    });
    renderRegion();
    expect(await screen.findByRole("heading", { level: 1, name: "Testland" })).toBeTruthy();
    const verdict = screen.getByRole("region", { name: "The verdict" });
    await waitFor(() => expect(verdict.textContent).toContain("Not available for this region yet."));
    const week = screen.getByRole("region", { name: "This week" });
    await waitFor(() => expect(within(week).getByText("Status: Above normal")).toBeTruthy());
    expect(week.textContent).toContain("November so far: 1 vs a typical 1 by this date.");
    expect(within(screen.getByRole("navigation", { name: "Sections" })).getAllByRole("button")).toHaveLength(6);
  });

  it("shows the verdict sentence, both figures and the robustness table", async () => {
    mockFetch({ "regions.json": regionsJson(files), "testland/trend.json": trendJson() });
    renderRegion();
    const verdict = await screen.findByRole("region", { name: "The verdict" });
    await waitFor(() => expect(verdict.textContent).toContain("Test sentence."));
    expect(verdict.textContent).toContain("What the raw record suggests");
    expect(verdict.textContent).toContain("After harmonization");
    expect(verdict.textContent).toContain("How sure are we?");
  });

  it("writes toggles to the URL and reads them back", async () => {
    mockFetch({
      "regions.json": regionsJson(files),
      "testland/weekly.json": weeklyFullJson(),
      "testland/climatology.json": climatologyJson(),
    });
    renderRegion("/r/testland?lens=bogus&debug=1");
    const cal = await screen.findByRole("region", { name: "The fire calendar" });
    await waitFor(() => expect(within(cal).getByRole("radio", { name: "Harmonized record" })).toBeTruthy());
    expect(within(cal).getByRole("radio", { name: "Harmonized record" }).getAttribute("aria-checked")).toBe("true");
    // Two changes in one tick must both survive (no stale params).
    await act(async () => {
      within(cal).getByRole("radio", { name: "Months" }).click();
      within(cal).getByRole("radio", { name: "Naive splice" }).click();
    });
    const q = new URLSearchParams(currentSearch);
    expect(q.get("view")).toBe("months");
    expect(q.get("lens")).toBe("naive_splice");
    expect(q.get("debug")).toBe("1");
  });

  it("gives low_activity and unavailable their own layouts", async () => {
    mockFetch({ "regions.json": regionsJson(files), "testland/nowcast.json": nowcastJson("low_activity") });
    renderRegion();
    const week = await screen.findByRole("region", { name: "This week" });
    await waitFor(() => expect(week.querySelector('[data-layout="low_activity"]')).toBeTruthy());
    expect(week.textContent).toContain("Too little burning at this time of year to rank.");
  });

  it("says so for an unknown region", async () => {
    mockFetch({ "regions.json": regionsJson(files) });
    renderRegion("/r/atlantis");
    expect(await screen.findByText(/There is no place called/)).toBeTruthy();
  });
});

describe("Region page: date range and In this period", () => {
  it("shows range analytics, the this-month line, and presets write from/to", async () => {
    mockFetch({
      "regions.json": regionsJson({ files: ["daily", "nowcast"] }),
      "testland/daily.json": dailyJson(),
      "testland/nowcast.json": nowcastJson("normal"),
    });
    renderRegion();
    const panel = await screen.findByRole("region", { name: "In this period and downloads" });
    // 1+2+3+4+6+...+13 = 91 - 5 = 86; one missing day.
    await waitFor(() => expect(panel.textContent).toContain("86"));
    expect(panel.textContent).toContain("12 with data, 1 without (of 13)");
    expect(panel.textContent).toContain("shortened to fit");
    expect(panel.textContent).toContain("This month vs normal: November so far");
    expect(within(panel).getByText("Harmonized")).toBeTruthy();

    const bar = screen.getByRole("group", { name: "Date range" });
    await act(async () => within(bar).getByRole("button", { name: "VIIRS era 2012+" }).click());
    expect(new URLSearchParams(currentSearch).get("from")).toBe("2012-01-01");
    expect(new URLSearchParams(currentSearch).get("to")).toBeNull(); // default (last data day) is omitted
    await act(async () => within(bar).getByRole("button", { name: "This year" }).click());
    expect(new URLSearchParams(currentSearch).get("from")).toBe("2026-01-01");
    expect(within(bar).getByRole("button", { name: "This year" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("hides the this-month line when the range ends before the last data day", async () => {
    mockFetch({
      "regions.json": regionsJson({ files: ["daily", "nowcast"] }),
      "testland/daily.json": dailyJson(),
      "testland/nowcast.json": nowcastJson("normal"),
    });
    renderRegion("/r/testland?from=2026-11-02&to=2026-11-04");
    const panel = await screen.findByRole("region", { name: "In this period and downloads" });
    await waitFor(() => expect(panel.textContent).toContain("3 with data, 0 without (of 3)"));
    expect(panel.textContent).not.toContain("This month vs normal");
  });
});

describe("Region page: your area (AOI)", () => {
  const A = "85283473fffffff";
  const calibration = {
    schema_version: "1.0", generated_at: "x", code_version: "test", region: "testland", reference: "aqua_day",
    count_resolution: 6, shrinkage_n0: 50,
    eras: [
      { from: "2003-01-01", to: "2022-12-31", source: "aqua", kind: "observed" },
      { from: "2023-01-01", to: null, source: "snpp", kind: "harmonized" },
    ],
    fit_window: {}, noaa20_method: "direct", k_annual: { snpp: { k: 0.5, lo: 0.4, hi: 0.6 } }, k: { snpp: [] },
  };
  const csv = `h3_r5,ym,aqua,viirs\n${A},202211,7,20\n${A},202311,1,30\n85283477fffffff,202311,9,99\n`;

  it("loads cells_monthly on first use and shows the area series, top months and the calibration line", async () => {
    mockFetch({
      "regions.json": regionsJson({ files: ["calibration", "climatology"], optional_files: ["cells_monthly"] }),
      "testland/calibration.json": calibration,
      "testland/climatology.json": climatologyJson(),
      "testland/cells_monthly.csv": csv,
    });
    renderRegion(`/r/testland?aoi=${A}`);
    const panel = await screen.findByRole("region", { name: /Your area \(1 hexagon, about \d[\d,]* km²\)/ });
    await waitFor(() => expect(panel.textContent).toContain("Calibration measured for the whole region is applied to your area. Treat small areas as indicative."));
    // Nov 2023 = 30 VIIRS x 0.5 = 15 (harmonized); Nov 2022 = 7 Aqua (observed). The other cell is not selected.
    expect(panel.textContent).toContain("November 2023: 15");
    expect(panel.textContent).toContain("November 2022: 7");
    expect(within(panel).getAllByText("Harmonized").length).toBeGreaterThan(0);
    await act(async () => within(panel).getByRole("button", { name: "Clear area" }).click());
    expect(new URLSearchParams(currentSearch).get("aoi")).toBeNull();
    expect(screen.queryByRole("region", { name: /Your area/ })).toBeNull();
  });

  it("says the area data are missing when cells_monthly is not listed", async () => {
    mockFetch({ "regions.json": regionsJson({ files: ["calibration"], optional_files: [] }), "testland/calibration.json": calibration });
    renderRegion(`/r/testland?aoi=${A}`);
    const panel = await screen.findByRole("region", { name: /Your area/ });
    expect(panel.textContent).toContain("Area data are not available for this place.");
  });
});

describe("Region page: downloads", () => {
  function captureDownloads() {
    const saved = [];
    vi.stubGlobal("URL", Object.assign(Object.create(URL), URL, {
      createObjectURL: (blob) => {
        saved.push({ blob });
        return "blob:test";
      },
      revokeObjectURL: () => {},
    }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function () {
      saved.at(-1).name = this.download;
    });
    return { saved, restore: () => click.mockRestore() };
  }

  it("downloads the series and calendar CSVs and lists overlapping archives", async () => {
    const downloads = {
      schema_version: "1.0", generated_at: "x", code_version: "test", region: "testland",
      hotspot_archives: [
        { year: 2026, sensor: "noaa20", url: "https://example.org/a.csv.gz", rows: 1200, bytes: 34567 },
        { year: 2010, sensor: "snpp", url: "https://example.org/b.csv.gz", rows: 1, bytes: 1 },
      ],
    };
    mockFetch({
      "regions.json": regionsJson({ files: ["daily", "weekly"], optional_files: ["downloads", "hotspots_recent"] }),
      "testland/daily.json": dailyJson(),
      "testland/weekly.json": weeklyFullJson(),
      "testland/downloads.json": downloads,
    });
    const cap = captureDownloads();
    renderRegion("/r/testland?from=2026-11-01");
    const sec = await screen.findByRole("region", { name: "In this period and downloads" });
    const seriesBtn = await within(sec).findByRole("button", { name: "Series CSV" });
    await waitFor(() => expect(seriesBtn.disabled).toBe(false));
    await act(async () => seriesBtn.click());
    expect(cap.saved[0].name).toBe("firerosetta_testland_harmonized_2026-11-01_2026-11-13.csv");
    const lines = (await cap.saved[0].blob.text()).trimEnd().split("\n");
    expect(lines[0]).toMatch(/^# FireRosetta test .* region=testland lens=harmonized unit=Aqua-equivalent fire cell-days per day source=NASA FIRMS$/);
    expect(lines).toHaveLength(2 + 13);
    expect(lines[2 + 4]).toBe("2026-11-05,harmonized,,,,missing,,Aqua-equivalent fire cell-days per day");

    const calBtn = within(sec).getByRole("button", { name: "Calendar CSV" });
    await waitFor(() => expect(calBtn.disabled).toBe(false));
    await act(async () => calBtn.click());
    expect(cap.saved[1].name).toBe("firerosetta_testland_harmonized_2026-11-01_2026-11-13_weeks.csv");

    expect(within(sec).getByRole("button", { name: "PNG" }).disabled).toBe(true);
    expect(within(sec).getByRole("link", { name: /Last 31 days/ }).getAttribute("download")).toBe("firerosetta_testland_hotspots_recent.csv");
    await waitFor(() => expect(sec.textContent).toContain("2026, VIIRS on NOAA-20"));
    expect(sec.textContent).not.toContain("2010, VIIRS on Suomi NPP");
    expect(within(sec).getByRole("link", { name: /Season Brief/ }).getAttribute("href")).toBe("/r/testland/brief?from=2026-11-01");
    cap.restore();
  });

  it("says plainly when hotspot files are not available", async () => {
    mockFetch({ "regions.json": regionsJson({ files: [], optional_files: [] }) });
    renderRegion();
    const sec = await screen.findByRole("region", { name: "In this period and downloads" });
    expect(sec.textContent).toContain("Recent hotspot records are not available for this place.");
    expect(sec.textContent).toContain("Yearly hotspot archives are not available for this place.");
  });
});

describe("month-to-date line", () => {
  it("fills the challenge wording and is omitted when a number is missing", () => {
    expect(monthToDateLine({ month: 11, through_day: 14, value: 412, median: 380.25, ratio: 1.08, percentile: 60 })).toBe(
      "November so far: 412 vs a typical 380.3 by this date.",
    );
    expect(monthToDateLine({ month: 11, value: null, median: 3 })).toBeNull();
  });
});
