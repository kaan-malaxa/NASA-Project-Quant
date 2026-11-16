import { test, expect } from "@playwright/test";
import { buildFiles } from "./fixtures.js";

for (const width of [1280, 390]) {
  test(`guided tutorial across routes at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const files = buildFiles({ sample: false });
    const registry = JSON.parse(files['regions.json'].body);
    const us = { ...registry.regions[0], id: 'us', name: 'United States' };
    registry.regions.push(us);
    files['regions.json'].body = JSON.stringify(registry);
    for (const [path, f] of Object.entries(files)) {
      if (path.startsWith('alpha/')) files[path.replace('alpha/', 'us/')] = { ...f, body: f.body.replaceAll('"alpha"', '"us"') };
    }
    await page.route(/\/data\//, route => {
      const path = new URL(route.request().url()).pathname.split('/data/')[1];
      const f = files[path];
      return route.fulfill(f ? { body: f.body, contentType: f.type } : { status: 404, body: 'not found' });
    });
    await page.goto('./#/pick');
    const launch = page.getByRole('button', { name: 'How to use this site' });
    await launch.click();
    const dialog = page.getByTestId('tutorial');
    await expect(page.getByTestId('tour-highlight')).toBeVisible();
    await expect.poll(async () => {
      const b = await dialog.boundingBox();
      return b.y + b.height;
    }).toBeLessThanOrEqual(844);
    await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeInViewport();
    await page.screenshot({ path: `test-results/tutorial-picker-${width}.png` });
    await dialog.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page).toHaveURL(/#\/r\/us/);
    await expect(dialog).toContainText('Read the summary', { timeout: 10000 });
    await expect(page.getByTestId('tour-highlight')).toBeVisible();
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
    const highlight = await page.getByTestId('tour-highlight').boundingBox();
    expect(highlight.x).toBeGreaterThanOrEqual(0);
    expect(highlight.x + highlight.width).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await page.screenshot({ path: `test-results/tutorial-${width}.png` });
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await page.goto('./#/pick');
    await launch.click();
    await expect(dialog).toContainText('Step 1 of');
    await dialog.getByRole('button', { name: 'Skip tutorial' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(launch).toBeFocused();
  });
}
