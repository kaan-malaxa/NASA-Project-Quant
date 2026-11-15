import { test, expect } from "@playwright/test";
import { open, watch, seriousAxe, overflowsHorizontally } from "./helpers.js";

test.describe("published real outputs", () => {
  test("analysis years restore through the URL and keep exact dates separate", async ({page}) => {
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

  test("whole-region AOI, exports, keyboard, mobile and basemap fallback use real data", async ({page}) => {
    const errors = watch(page);
    await page.emulateMedia({reducedMotion:"reduce"});
    await page.setViewportSize({width:390,height:844});
    await page.route("https://tiles.openfreemap.org/**", (route) => route.abort("blockedbyclient"));
    await open(page, "#/r/us?analysis_from=2022&analysis_to=2022&view=months");
    await page.getByRole("gridcell").first().focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", {name:/close/i}).first()).toBeVisible();
    await page.locator("#where").scrollIntoViewIfNeeded();
    await expect(page.locator("#where svg, #where canvas").first()).toBeVisible();
    const download = page.waitForEvent("download");
    await page.getByRole("button", {name:/series csv/i}).click();
    expect((await download).suggestedFilename()).toMatch(/firerosetta_us/);
    expect(await overflowsHorizontally(page)).toBe(false);
    expect(await seriousAxe(page)).toEqual([]);
    expect(errors).toEqual([]);
  });
});
