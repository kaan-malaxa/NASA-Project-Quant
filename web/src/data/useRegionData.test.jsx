import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { initialFileStates, useRegionData } from "./useRegionData.js";
import { visibleRegions } from "./useRegions.js";
import { clearFetchCache } from "./fetchJson.js";
import { resetSample } from "./sample.js";
import SectionState from "@/components/SectionState.jsx";
import { mockFetch } from "@/test/mockFetch.js";
import { regionsJson, trendJson, weeklyJson } from "@/test/fixtures.js";

beforeEach(() => {
  clearFetchCache();
  resetSample();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function Harness({ id = "testland" }) {
  const { status, files } = useRegionData(id);
  if (status !== "ok") return <p>region status: {status}</p>;
  return (
    <>
      <section aria-label="weekly">
        <SectionState state={files.weekly} title="Calendar">
          {(d) => <p>weekly rows: {d.rows.length}</p>}
        </SectionState>
      </section>
      <section aria-label="trend">
        <SectionState state={files.trend} title="Verdict">
          {(d) => <p>{d.sentence}</p>}
        </SectionState>
      </section>
    </>
  );
}

const renderAt = (ui, path = "/") => render(<MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>);

describe("useRegionData", () => {
  it("renders the other sections when the trend file is absent on the server", async () => {
    mockFetch({ "regions.json": regionsJson(), "testland/weekly.json": weeklyJson() });
    renderAt(<Harness />);
    await waitFor(() => expect(screen.getByText("weekly rows: 1")).toBeTruthy());
    await waitFor(() => expect(screen.getByLabelText("trend").textContent).toContain("Not available for this region yet."));
  });

  it("renders the other sections when trend is not listed for the region", async () => {
    mockFetch({ "regions.json": regionsJson({ files: ["weekly"] }), "testland/weekly.json": weeklyJson() });
    renderAt(<Harness />);
    await waitFor(() => expect(screen.getByText("weekly rows: 1")).toBeTruthy());
    expect(screen.getByLabelText("trend").textContent).toContain("Not available for this region yet.");
  });

  it("shows the validation reason for an invalid trend file and keeps the rest", async () => {
    const bad = trendJson();
    delete bad.sentence;
    mockFetch({ "regions.json": regionsJson(), "testland/weekly.json": weeklyJson(), "testland/trend.json": bad });
    renderAt(<Harness />);
    await waitFor(() => expect(screen.getByLabelText("trend").textContent).toContain("This file failed validation."));
    expect(screen.getByLabelText("trend").textContent).toContain("sentence");
    expect(screen.getByText("weekly rows: 1")).toBeTruthy();
  });

  it("reports an unknown region, and hides synthetic regions without ?debug=1", async () => {
    mockFetch({ "regions.json": regionsJson() });
    renderAt(<Harness id="synthland" />);
    await waitFor(() => expect(screen.getByText("region status: unknown_region")).toBeTruthy());
  });

  it("shows a synthetic region with ?debug=1", async () => {
    mockFetch({ "regions.json": regionsJson() });
    renderAt(<Harness id="synthland" />, "/r/synthland?debug=1");
    await waitFor(() => expect(screen.getByLabelText("trend").textContent).toContain("Not available"));
  });

  it("marks unlisted files absent and CSVs lazy", () => {
    const s = initialFileStates(regionsJson().regions[0]);
    expect(s.weekly.status).toBe("loading");
    expect(s.hex.status).toBe("absent");
    expect(s.cells_monthly.status).toBe("lazy");
    expect(s.hotspots_recent.status).toBe("absent");
  });

  it("filters synthetic regions", () => {
    const regions = regionsJson().regions;
    expect(visibleRegions(regions, false).map((r) => r.id)).toEqual(["testland"]);
    expect(visibleRegions(regions, true).map((r) => r.id)).toEqual(["testland", "synthland"]);
  });
});
