import { expect, test } from "@playwright/test";
import { serveData } from "./fixtures.js";
import { watch } from "./helpers.js";

/** Delay every data response (after serveData has built it), to mimic a slow connection. */
async function slowData(page, ms = 1500) {
  await page.route(/\/data\//, async (route) => {
    await new Promise((r) => setTimeout(r, ms));
    await route.fallback();
  });
}

/**
 * Sample the tour box on every animation frame for `ms`: its rect, and whether it is visible at all
 * (opacity above zero and not visibility: hidden).
 */
function sampleBox(page, ms) {
  return page.evaluate(
    (ms) =>
      new Promise((resolve) => {
        const out = [];
        const start = performance.now();
        const step = () => {
          const el = document.querySelector('[data-testid="tutorial"]');
          if (el) {
            const cs = getComputedStyle(el);
            const r = el.getBoundingClientRect();
            out.push({
              t: Math.round(performance.now() - start),
              visible: cs.visibility !== "hidden" && parseFloat(cs.opacity) > 0.01,
              left: r.left,
              top: r.top,
              right: window.innerWidth - r.right,
              bottom: window.innerHeight - r.bottom,
              placed: el.getAttribute("data-placed"),
            });
          }
          if (performance.now() - start < ms) requestAnimationFrame(step);
          else resolve(out);
        };
        requestAnimationFrame(step);
      }),
    ms,
  );
}

function checkSamples(samples) {
  const visible = samples.filter((s) => s.visible);
  expect(visible.length, "the box became visible").toBeGreaterThan(0);
  // never visible in (or near) the top-left corner
  for (const s of visible)
    expect(s.left < 40 && s.top < 40, `visible at ${s.left},${s.top} at ${s.t} ms`).toBe(false);
  // ...nor in any other corner (the old fallback was the bottom-left one): on this desktop viewport a placed box
  // sits next to its target or in the middle
  for (const s of visible) {
    const nearX = s.left < 40 || s.right < 40;
    const nearY = s.top < 40 || s.bottom < 40;
    expect(nearX && nearY, `visible in a corner at ${s.t} ms`).toBe(false);
  }
  // once visible, it stays put (allowing the short fade-in slide)
  const first = visible[0];
  for (const s of visible) {
    expect(Math.abs(s.left - first.left), `moved sideways at ${s.t} ms`).toBeLessThanOrEqual(8);
    expect(Math.abs(s.top - first.top), `moved up or down at ${s.t} ms`).toBeLessThanOrEqual(8);
  }
  // it is only visible once placed
  for (const s of visible) expect(s.placed).not.toBe("waiting");
}

test.describe("guided tour placement", () => {
  test("opening on #/pick with slow data: never in the corner, still once shown", async ({ page }) => {
    test.setTimeout(45_000);
    const problems = watch(page);
    await serveData(page, { sample: false });
    await slowData(page);
    await page.goto("./#/pick");
    const launch = page.getByRole("button", { name: "How to use this site" });
    await expect(launch).toBeVisible();
    await launch.click(); // while the cards are still loading
    const samples = await sampleBox(page, 4000);
    checkSamples(samples);
    expect(samples.find((s) => s.visible).placed).toBe("anchored");
    expect(problems).toEqual([]);
  });

  test("moving to a step on the region page: no flash on the old page or in the corner", async ({ page }) => {
    test.setTimeout(60_000);
    await serveData(page, { sample: false });
    await slowData(page);
    await page.goto("./#/pick");
    await page.getByRole("button", { name: "How to use this site" }).click();
    const tour = page.getByTestId("tutorial");
    await expect(tour).toHaveClass(/is-shown/, { timeout: 8000 });
    await tour.getByRole("button", { name: "Next" }).click(); // goes to the region page's verdict
    const samples = await sampleBox(page, 5000);
    // the old step's box must not reappear on the new page before it is placed there
    checkSamples(samples.filter((s) => s.t > 200));
    await expect(page).toHaveURL(/#\/r\//);
    await expect(tour.getByRole("heading", { name: "The verdict" })).toBeVisible();
  });
});
