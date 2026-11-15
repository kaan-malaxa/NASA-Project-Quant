import { expect, test } from "@playwright/test";
import { serveData } from "./fixtures.js";
import { open, overflowsHorizontally, seriousAxe, watch } from "./helpers.js";

// Every route in contracts section 7 (alpha is a test region from e2e/fixtures.js).
const ROUTES = [
  ["#/", "landing"],
  ["#/pick", "place picker"],
  ["#/r/alpha", "region story"],
  ["#/r/alpha/brief", "season brief"],
  ["#/methods", "methods"],
  ["#/gallery", "gallery"],
  ["#/no/such/page", "catch-all"],
];

for (const [hash, name] of ROUTES) {
  test.describe(`${name} (${hash})`, () => {
    test("loads with zero console errors, zero failed requests and nothing off-origin", async ({ page }) => {
      const problems = watch(page);
      await serveData(page);
      await open(page, hash);
      expect(problems).toEqual([]);
    });

    test("has no serious or critical axe violations", async ({ page }) => {
      await serveData(page);
      await open(page, hash);
      expect(await seriousAxe(page)).toEqual([]);
    });

    test("does not overflow horizontally at 390x844", async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await serveData(page);
      await open(page, hash);
      expect(await overflowsHorizontally(page)).toBe(false);
    });
  });
}

test("each route sets its own title and description", async ({ page }) => {
  await serveData(page);
  const seen = new Set();
  for (const [hash] of ROUTES) {
    await open(page, hash);
    const title = await page.title();
    const description = await page.locator('meta[name="description"]').getAttribute("content");
    expect(title).toContain("FireRosetta");
    expect(description.length).toBeGreaterThan(20);
    seen.add(title);
  }
  expect(seen.size).toBe(ROUTES.length);
  expect(await page.locator("html").getAttribute("lang")).toBe("en");
  expect(await page.locator('link[rel="icon"]').getAttribute("href")).toBe("favicon.svg");
  expect(await page.locator('meta[property="og:image"]').getAttribute("content")).toMatch(/og-image\.png$/);
});
