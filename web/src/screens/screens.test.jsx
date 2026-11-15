import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Landing from "./Landing.jsx";
import Picker from "./Picker.jsx";
import { clearFetchCache } from "@/data/fetchJson.js";
import { resetSample } from "@/data/sample.js";
import { mockFetch } from "@/test/mockFetch.js";
import { methodsJson, nowcastJson, outlineGeojson, regionsJson, rulerJson } from "@/test/fixtures.js";

beforeEach(() => {
  clearFetchCache();
  resetSample();
  // The landing loader shows once per session; these tests are about the page under it (see landing/loader.test.jsx).
  localStorage.setItem("firerosetta-loader-off", "1");
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const at = (ui, path = "/") => render(<MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>);
const listed = { files: ["ruler", "outline", "nowcast"], optional_files: [] };

describe("Landing", () => {
  it("shows the ruler sentence and the why-now line from JSON", async () => {
    mockFetch({
      "regions.json": regionsJson(listed),
      "testland/ruler.json": rulerJson(),
      "methods.json": methodsJson([
        { claim_id: "aqua_drift", text: "Aqua drift text.", url: "https://example.org/a", checked: "2026-11-14" },
        { claim_id: "snpp_end", text: "S-NPP end text.", url: "https://example.org/s", checked: "2026-11-14" },
        { claim_id: "submission_rules", text: "Not shown.", url: "https://example.org/r", checked: "2026-11-14" },
      ]),
    });
    at(<Landing />);
    await waitFor(() => expect(screen.getByText("Ruler sentence from JSON.")).toBeTruthy());
    const why = await screen.findByTestId("why-now");
    expect(why.textContent.indexOf("S-NPP end text.")).toBeLessThan(why.textContent.indexOf("Aqua drift text."));
    expect(why.textContent).not.toContain("Not shown.");
    expect(screen.getByText("Open on your phone")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "Pick a place" }).length).toBeGreaterThan(0);
  });

  it("omits the why-now line when the claims are absent, and survives a missing ruler", async () => {
    mockFetch({ "regions.json": regionsJson(listed), "methods.json": methodsJson([]) });
    at(<Landing />);
    await waitFor(() => expect(screen.getByText(/Not available for this region yet/)).toBeTruthy());
    expect(screen.queryByTestId("why-now")).toBeNull();
  });
});

describe("Picker", () => {
  it("renders one linked card per visible region with outline and status in words", async () => {
    mockFetch({
      "regions.json": regionsJson(listed),
      "testland/outline.geojson": outlineGeojson(),
      "testland/nowcast.json": nowcastJson("above_normal"),
    });
    at(<Picker />);
    const link = await screen.findByRole("link", { name: /Testland/ });
    expect(link.getAttribute("href")).toBe("/r/testland");
    await waitFor(() => expect(screen.getByText("This week: Above normal")).toBeTruthy());
    expect(screen.getByRole("img", { name: "Outline of Testland" })).toBeTruthy();
    expect(screen.queryByText("Synthland")).toBeNull();
  });

  it("shows synthetic regions with ?debug=1 and keeps debug in the link", async () => {
    mockFetch({ "regions.json": regionsJson(listed) });
    at(<Picker />, "/pick?debug=1");
    const link = await screen.findByRole("link", { name: /Synthland/ });
    expect(link.getAttribute("href")).toBe("/r/synthland?debug=1");
  });
});
