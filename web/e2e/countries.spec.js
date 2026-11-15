import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { open, watch, seriousAxe, overflowsHorizontally } from "./helpers.js";
import { fmtNumber } from "../src/lib/format.js";

const catalog = JSON.parse(readFileSync(new URL("../public/data/world.json", import.meta.url), "utf8"));
const portugal = catalog.countries.find((country) => country.id === "portugal");

for (const width of [1280, 390]) {
  test(`world country source records work at ${width}px`, async ({ page }) => {
    const problems = watch(page);
    await page.setViewportSize({ width, height: 844 });
    await open(page, "#/pick?country=portugal&product=viirs-snpp");
    await expect(page.getByRole("heading", { name: "Portugal", exact: true })).toBeVisible();
    const record = portugal.records.find((entry) => entry.product === "viirs-snpp");
    const row = page.getByRole("row").filter({ has: page.getByRole("rowheader", { name: String(record.year), exact: true }) });
    await expect(row).toContainText(fmtNumber(record.detections, 0));
    await expect(row.getByRole("link")).toHaveAttribute("href", record.url);
    await page.getByLabel("Satellite product").selectOption("modis");
    await expect(page).toHaveURL(/product=modis/);
    await page.reload();
    await expect(page.getByLabel("Satellite product")).toHaveValue("modis");
    const search = page.getByRole("searchbox");
    await search.fill("Fiji");
    const countryList = page.getByRole("list", { name: "Country archives" });
    await expect(countryList.getByRole("button")).toHaveCount(1);
    await countryList.getByRole("button", { name: "Fiji", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Fiji", exact: true })).toBeVisible();
    await expect(page).toHaveURL(/country=fiji/);
    await search.fill("no-match-country");
    await expect(page.getByText("No countries match your search.")).toBeVisible();
    expect(await overflowsHorizontally(page)).toBe(false);
    expect(await seriousAxe(page)).toEqual([]);
    expect(problems).toEqual([]);
  });
}

test("logo, launch styling and the path to country data work together", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const problems = watch(page);
  await open(page, "#/");
  const logo = page.getByRole("banner").getByRole("img", { name: "Prometheus Torch" });
  await expect(logo).toBeVisible();
  await expect(logo).toHaveJSProperty("naturalWidth", 1360);
  const cta = page.locator(".landing-cta");
  await expect(cta).toHaveCSS("box-shadow", "none");
  await cta.click();
  await expect(page.getByRole("heading", { name: "World country data" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "United States", exact: true }).last()).toBeVisible();
  await page.getByRole("link", { name: "Open analysis" }).click();
  await expect(page).toHaveURL(/#\/r\/us/);
  expect(problems).toEqual([]);
});
