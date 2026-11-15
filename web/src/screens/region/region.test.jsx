import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import Region from "../Region.jsx";
import { monthToDateLine } from "./ThisWeekSection.jsx";
import { clearFetchCache } from "@/data/fetchJson.js";
import { resetSample } from "@/data/sample.js";
import { mockFetch } from "@/test/mockFetch.js";
import { climatologyJson, nowcastJson, regionsJson, trendJson, weeklyFullJson } from "@/test/fixtures.js";

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

describe("month-to-date line", () => {
  it("fills the challenge wording and is omitted when a number is missing", () => {
    expect(monthToDateLine({ month: 11, through_day: 14, value: 412, median: 380.25, ratio: 1.08, percentile: 60 })).toBe(
      "November so far: 412 vs a typical 380.3 by this date.",
    );
    expect(monthToDateLine({ month: 11, value: null, median: 3 })).toBeNull();
  });
});
