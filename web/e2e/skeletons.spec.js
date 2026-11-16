import { test, expect } from "@playwright/test";

for (const width of [1280, 390]) {
    for (const route of ["pick", "r/us"]) {
        test(`Slow 4G skeletons ${route} ${width}px`, async ({ page }) => {
            test.setTimeout(120000);
            await page.setViewportSize({ width, height: 844 });
            await page.addInitScript(() => {
                localStorage.setItem("pt-tutorial-seen", "1");
                localStorage.setItem("firerosetta-loader-off", "1");
            });
            const cdp = await page.context().newCDPSession(page);
            await cdp.send("Network.enable");
            await cdp.send("Network.emulateNetworkConditions", {
                offline: false,
                latency: 562,
                downloadThroughput: 200000,
                uploadThroughput: 93750,
            });
            let release;
            const gate = new Promise((resolve) => {
                release = resolve;
            });
            await page.route("**/data/regions.json", async (r) => {
                await gate;
                await r.continue();
            });
            await page.goto(`./#/${route}`, { waitUntil: "domcontentloaded" });
            await expect(page.locator('[data-state="loading"]')).not.toHaveCount(0);
            await expect(page.locator('.loading-shapes[data-visible="true"]').first()).toBeVisible();
            await page.screenshot({ path: `test-results/skeleton-${route.replace("/", "-")}-${width}.png` });
            const before = await page
                .locator('main [data-placeholder-section], main .sk-page > header, main .sk-page > .loading-frame, main .sk-cards')
                .evaluateAll((els) =>
                    els.map((el) => ({
                        title: el.getAttribute("data-placeholder-section") || el.getAttribute("aria-label") || el.tagName,
                        height: Math.round(el.getBoundingClientRect().height),
                    })),
                );
            console.log("SKELETON_HEIGHTS", route, width, JSON.stringify(before));
            release();
            await page.waitForLoadState("networkidle");
            await expect(page.locator('[data-state="loading"]')).toHaveCount(0, { timeout: 90000 });
            expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
            await cdp.send("Network.emulateNetworkConditions", {
                offline: false,
                latency: 0,
                downloadThroughput: -1,
                uploadThroughput: -1,
            });
            // Measure a reload of the scientific period without changing the selected years or dates.
            if (route === "pick") {
              const height = Math.round((await page.locator('[data-tour="places"]').boundingBox()).height);
              console.log("LOADED_PICKER_HEIGHT", width, height);
              expect(Math.abs(height - before.find(row => row.title === "DIV").height)).toBeLessThanOrEqual(5);
            }
            if (route === "r/us") {
                const measurements = await page
                    .locator("main section[id], main header, main .sticky")
                    .evaluateAll((els) =>
                        els.map((el) => ({
                            id: el.id || el.className,
                            height: Math.round(el.getBoundingClientRect().height),
                        })),
                    );
                console.log("LOADED_HEIGHTS", width, JSON.stringify(measurements));
                const names = {verdict: 'verdict', calendar: 'calendar', critical: 'critical-weeks', week: 'this-week', map: 'where', downloads: 'downloads'};
                for (const row of before) {
                  if (!names[row.title]) continue;
                  const final = measurements.find(item => item.id === names[row.title]);
                  expect(Math.abs(final.height - row.height), `${row.title} height change at ${width}px`).toBeLessThanOrEqual(5);
                }
                const mapBefore = Math.round((await page.locator('#where').boundingBox()).height);
                await page.route('https://tiles.openfreemap.org/**', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ version: 8, sources: {}, layers: [] }) }));
                await page.locator('#where').scrollIntoViewIfNeeded();
                await page.waitForFunction(() => {
                  const el = document.querySelector('#where');
                  return !el.querySelector('[data-state="loading"]') && el.querySelector('[data-chart-shell="HexMap"] svg,[data-chart-shell="HexMap"] canvas');
                }, null, { timeout: 30000 });
                await page.waitForLoadState('networkidle');
                const mapAfter = Math.round((await page.locator('#where').boundingBox()).height);
                console.log('MAP_ACTIVATION_HEIGHTS', width, mapBefore, mapAfter);
                expect(Math.abs(mapAfter - mapBefore)).toBeLessThanOrEqual(5);
            }
        });
    }
}
