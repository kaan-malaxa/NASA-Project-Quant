import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import CountryBrowser from "./CountryBrowser.jsx";
import { clearFetchCache } from "@/data/fetchJson.js";
import { mockFetch } from "@/test/mockFetch.js";
import example from "../../../contracts/examples/world.json";

beforeEach(clearFetchCache);
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function open(data = example, path = "/pick", regions = []) {
  mockFetch({ "world.json": data });
  return render(<MemoryRouter initialEntries={[path]}><CountryBrowser regions={regions} /></MemoryRouter>);
}

describe("world country source browser", () => {
  it("renders validated source records and their original NASA URLs", async () => {
    open();
    const table = await screen.findByRole("table");
    expect(within(table).getByRole("rowheader", { name: "2025" })).toBeTruthy();
    expect(within(table).getByText("3")).toBeTruthy();
    expect(within(table).getByRole("link").getAttribute("href")).toBe(example.countries[0].records[0].url);
    expect(screen.getByText("Calibrated analysis is pending for this country.")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Open analysis/ })).toBeNull();
  });

  it("filters countries and reports an empty search without losing the selected record", async () => {
    open();
    const input = await screen.findByRole("searchbox");
    fireEvent.change(input, { target: { value: "PORT" } });
    expect(within(screen.getByRole("list", { name: "Country archives" })).getAllByRole("button")).toHaveLength(1);
    fireEvent.change(input, { target: { value: "no-match" } });
    expect(screen.getByText("No countries match your search.")).toBeTruthy();
    expect(screen.getByRole("table")).toBeTruthy();
  });

  it("restores the selected product and preserves raw counts independently", async () => {
    const data = structuredClone(example);
    data.products.push({ id: "modis", label: "MODIS · Terra and Aqua" });
    data.countries[0].records.push({ ...data.countries[0].records[0], product: "modis", detections: 17,
      url: "https://firms.modaps.eosdis.nasa.gov/data/country/modis/2025/modis_2025_Portugal.csv" });
    open(data, "/pick?country=portugal&product=modis");
    const select = await screen.findByLabelText("Satellite product");
    expect(select.value).toBe("modis");
    expect(within(screen.getByRole("table")).getByText("17")).toBeTruthy();
    fireEvent.change(select, { target: { value: "viirs-snpp" } });
    expect(within(screen.getByRole("table")).getByText("3")).toBeTruthy();
    expect(within(screen.getByRole("table")).queryByText("17")).toBeNull();
  });

  it("links a published country to its existing analysis", async () => {
    open(example, "/pick?country=portugal&debug=1", [{ id: "portugal" }]);
    expect((await screen.findByRole("link", { name: /Open analysis/ })).getAttribute("href")).toBe("/r/portugal?debug=1");
  });

  it("handles an unknown country and allows recovery through selection", async () => {
    open(example, "/pick?country=unknown");
    expect(await screen.findByText(/This country is unavailable/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Portugal" }));
    expect(screen.getByRole("table")).toBeTruthy();
  });

  it("shows a validation failure for malformed data", async () => {
    open({ ...example, countries: [{ id: "bad" }] });
    expect(await screen.findByText("This file failed validation.")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });
});
