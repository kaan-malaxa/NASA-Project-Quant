import { test, expect } from "@playwright/test";
import { open, watch, seriousAxe, overflowsHorizontally } from "./helpers.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { fmtNumber } from "../src/lib/format.js";

const readPublished = (path) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`../public/data/${path}`, import.meta.url)), "utf8"));

test.describe("published real outputs", () => {
  test("analysis years restore through the URL and keep exact dates separate", async ({ page }) => {
    const errors = watch(page);
    await page.route("https://tiles.openfreemap.org/**", (route) => route.abort("blockedbyclient"));
    await open(page, "#/r/us?analysis_from=2010&analysis_to=2015&from=2020-02-01&to=2020-03-01");
    await expect(page.getByLabel("First analysis year")).toHaveValue("2010");
    await expect(page.getByLabel("Last analysis year")).toHaveValue("2015");
    await expect(page.getByLabel("From: 2020-02-01")).toBeVisible();
    await page.getByLabel("First analysis year").selectOption("2014");
    await expect(page).toHaveURL(/analysis_from=2014/);
    await expect(page.locator("#verdict")).toContainText(/unavailable/i);
    await page.reload();
    await expect(page.getByLabel("First analysis year")).toHaveValue("2014");
    await expect(page.locator("#verdict")).toContainText(/unavailable/i);
    expect(await seriousAxe(page)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("calendar exports, keyboard, mobile and basemap fallback use real data", async ({ page }) => {
    test.setTimeout(180000);
    const errors = watch(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route("https://tiles.openfreemap.org/**", (route) => route.abort("blockedbyclient"));
    await open(page, "#/r/us?analysis_from=2022&analysis_to=2022&view=months");
    await page.getByRole("grid").first().focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: /close/i }).first()).toBeVisible();
    await page.locator("#where").scrollIntoViewIfNeeded();
    await expect(
      page.locator('#where canvas.maplibregl-canvas, #where svg.fr-viz [role="button"]').first(),
    ).toBeVisible({ timeout: 60000 });
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: /series csv/i }).click();
    expect((await download).suggestedFilename()).toMatch(/prometheus_torch_us/);
    expect(await overflowsHorizontally(page)).toBe(false);
    expect(await seriousAxe(page)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("selected real cells sum authoritative contributions and preserve the brief URL", async ({ page }) => {
    test.setTimeout(180000);
    const shard = readPublished("us/spatial/2022.json");
    const series = shard.series.indexOf("harmonized");
    const rows = shard.monthly.filter((row) => row[1] === 4 && row[2] === series).sort((a, b) => b[3] - a[3]);
    expect(rows.length).toBeGreaterThan(1);
    const cells = rows.slice(0, 2).map((row) => shard.cells[row[0]]);
    const expected = rows.slice(0, 2).reduce((total, row) => total + row[3], 0);
    const errors = watch(page);
    await page.route("https://tiles.openfreemap.org/**", (route) => route.abort("blockedbyclient"));
    await open(
      page,
      `#/r/us?analysis_from=2022&analysis_to=2022&view=months&from=2022-04-01&to=2022-04-30&aoi=${cells.join(",")}`,
    );
    const area = page.getByRole("region", { name: /Your area/ });
    await expect(area).toContainText(`April 2022: ${fmtNumber(expected)}`, { timeout: 120000 });
    await expect(area).toContainText("Daily source selection and coverage scaling match the regional record");
    const link = page.getByRole("link", { name: "Season Brief" });
    await expect(link).toHaveAttribute("href", /analysis_from=2022/);
    await expect(link).toHaveAttribute("href", /aoi=/);
    expect(errors).toEqual([]);
  });
});

for (const route of ["r/us", "methods", "r/us/brief"]) {
  for (const width of [1280, 390]) {
    test(`real ${route} at ${width}px has accessible content and no overflow`, async ({ page }) => {
      test.setTimeout(180000);
      const errors = watch(page);
      await page.setViewportSize({ width, height: 844 });
      await page.route("https://tiles.openfreemap.org/**", (request) => request.abort("blockedbyclient"));
      await open(page, `#/${route}?analysis_from=2022&analysis_to=2022`);
      expect(await overflowsHorizontally(page)).toBe(false);
      expect(await seriousAxe(page)).toEqual([]);
      expect(errors).toEqual([]);
    });
  }
}
