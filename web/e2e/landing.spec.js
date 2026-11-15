import { expect, test } from "@playwright/test";
import { serveData } from "./fixtures.js";
import { open, overflowsHorizontally, watch } from "./helpers.js";

/** The loader shows once per session; tests about the page itself start as if it had been seen. */
async function skipLoader(page) {
  await page.addInitScript(() => localStorage.setItem("firerosetta-loader-off", "1"));
}

/** The landing globe: satellites as buttons, the info panel, and the 3D scene itself (when WebGL is available). */
test.describe("landing globe", () => {
  test.beforeEach(async ({ page }) => {
    await skipLoader(page);
    await serveData(page, { sample: false });
  });

  test("satellite buttons open the panel by keyboard; Escape, the X and a press outside close it", async ({
    page,
  }) => {
    const problems = watch(page);
    await open(page, "#/");
    const names = ["Terra", "Aqua", "Suomi NPP", "NOAA-20", "NOAA-21"];
    for (const name of names)
      await expect(page.getByRole("button", { name: new RegExp(`^${name}`) })).toBeVisible();

    const aqua = page.locator('[data-satellite="aqua"]');
    await aqua.focus();
    await page.keyboard.press("Enter");
    const panel = page.getByRole("dialog");
    await expect(panel.getByRole("heading", { name: "Aqua" })).toBeVisible();
    await expect(panel).toContainText("Instrument: MODIS");
    await expect(panel).toContainText("about 1 km");
    // The role and its dates come from calibration.json.
    await expect(panel.getByTestId("satellite-role")).toContainText("Reference sensor");
    await expect(panel.getByTestId("satellite-role")).toContainText("2003-01-01 to 2022-12-31");

    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
    await expect(aqua).toBeFocused();

    await page.locator('[data-satellite="noaa21"]').click();
    await expect(panel).toContainText("375 m");
    await expect(panel.getByTestId("satellite-role")).toContainText("Not in the harmonized record");
    await panel.getByRole("button", { name: /Close/ }).click();
    await expect(panel).toHaveCount(0);

    await page.locator('[data-satellite="snpp"]').click();
    await expect(panel.getByRole("heading", { name: "Suomi NPP" })).toBeVisible();
    await page.mouse.click(40, 200);
    await expect(panel).toHaveCount(0);
    expect(problems).toEqual([]);
  });

  test("the Earth texture is served from the site itself", async ({ page }) => {
    const textures = [];
    page.on("request", (r) => r.url().includes("textures/") && textures.push(new URL(r.url())));
    await open(page, "#/");
    await expect.poll(() => textures.length).toBeGreaterThan(0);
    for (const u of textures) expect(u.origin).toBe(new URL(page.url()).origin);
  });

  test("in the 3D scene, hovering a satellite shows its name and clicking it opens its panel", async ({
    page,
  }) => {
    // Reduced motion holds the satellites still, so the pointer can find one.
    await page.emulateMedia({ reducedMotion: "reduce" });
    const problems = watch(page);
    await open(page, "#/");
    const canvas = page.locator('[data-testid="globe-stage"] canvas');
    test.skip(
      (await canvas.count()) === 0,
      "WebGL is not available in this browser: the static picture is shown instead",
    );
    await expect(page.getByTestId("static-earth")).toHaveCount(0);

    const box = await canvas.boundingBox();
    const label = page.locator(".globe-label");
    let found = null;
    scan: for (let y = box.y + 30; y < box.y + box.height - 30; y += 22) {
      for (let x = box.x + box.width * 0.2; x < box.x + box.width * 0.8; x += 22) {
        await page.mouse.move(x, y);
        if (await label.count()) {
          found = { x, y };
          break scan;
        }
      }
    }
    expect(found, "a satellite under the pointer").not.toBeNull();
    const name = await label.first().textContent();
    await page.mouse.click(found.x, found.y);
    const panel = page.getByRole("dialog");
    await expect(panel.getByRole("heading", { name })).toBeVisible();
    await expect(panel).toHaveAttribute("data-side", found.x < box.x + box.width / 2 ? "left" : "right");
    expect(problems).toEqual([]);
  });

  test("without WebGL the static Earth and the same buttons are shown", async ({ page }) => {
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
        return /webgl/i.test(type) ? null : original.call(this, type, ...rest);
      };
    });
    const problems = watch(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, "#/");
    await expect(page.getByTestId("static-earth")).toBeVisible();
    await expect(page.locator("canvas")).toHaveCount(0);
    await page.locator('[data-satellite="terra"]').click();
    await expect(page.getByRole("dialog").getByRole("heading", { name: "Terra" })).toBeVisible();
    expect(await overflowsHorizontally(page)).toBe(false);
    expect(problems).toEqual([]);
  });
});

/** Scroll story (Phase 2): read the stage's --t and the positions of the pieces. */
async function storyState(page) {
  return page.evaluate(() => {
    const stage = document.querySelector(".landing-hero");
    const box = (sel) => {
      const e = document.querySelector(sel);
      if (!e) return null;
      const r = e.getBoundingClientRect();
      return {
        x: r.x,
        y: r.y,
        w: r.width,
        h: r.height,
        bottom: r.bottom,
        opacity: Number(getComputedStyle(e).opacity),
      };
    };
    return {
      mode: stage.dataset.mode,
      t: Number(stage.style.getPropertyValue("--t") || 0),
      head: box("#landing-title"),
      ruler: box(".story-ruler"),
      chips: box(".satellite-chips"),
      stageH: stage.clientHeight,
    };
  });
}

async function scrollToY(page, y) {
  await page.evaluate((y) => window.scrollTo(0, y), y);
  await page.waitForTimeout(300);
}

test.describe("landing scroll story", () => {
  test.beforeEach(async ({ page }) => {
    await skipLoader(page);
    await serveData(page, { sample: false });
  });

  test("at 1280 nothing moves before the threshold; past it the move plays by itself to the end, and reverses", async ({
    page,
  }) => {
    const problems = watch(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await open(page, "#/");
    await expect.poll(async () => (await storyState(page)).mode).toBe("story");
    const top = await storyState(page);
    expect(top.t).toBe(0);
    expect(top.ruler.opacity).toBe(0);

    // A little scrolling, below the threshold: the stage does not move at all.
    await scrollToY(page, 150);
    await page.waitForTimeout(600);
    expect((await storyState(page)).t).toBe(0);

    // Just past the threshold, then no more scrolling: the whole move still completes.
    await scrollToY(page, 260);
    await expect.poll(async () => (await storyState(page)).t, { timeout: 4000 }).toBe(1);
    const end = await storyState(page);
    expect(end.ruler.opacity).toBe(1);
    expect(end.ruler.x + end.ruler.w).toBeLessThanOrEqual(640); // left half
    expect(end.head.bottom).toBeLessThanOrEqual(end.ruler.y + 1);
    expect(end.ruler.bottom).toBeLessThanOrEqual(end.stageH);
    await expect(page.locator(".story-ruler figcaption")).toBeVisible();

    // satellites stay clickable while the globe is small
    await page.locator('[data-satellite="aqua"]').click();
    await expect(page.getByRole("dialog").getByRole("heading", { name: "Aqua" })).toBeVisible();
    await page.keyboard.press("Escape");

    // Back above the threshold: it plays in reverse by itself.
    await scrollToY(page, 0);
    await expect.poll(async () => (await storyState(page)).t, { timeout: 4000 }).toBe(0);
    expect((await storyState(page)).ruler.opacity).toBe(0);
    expect(problems).toEqual([]);
  });

  test("at 390x844 the globe stays centred above the text, nothing overlaps the buttons, no sideways scroll", async ({
    page,
  }) => {
    const problems = watch(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, "#/");
    await expect.poll(async () => (await storyState(page)).mode).toBe("story");
    await scrollToY(page, 400);
    await expect.poll(async () => (await storyState(page)).t, { timeout: 4000 }).toBe(1);
    const s = await storyState(page);
    expect(s.ruler.bottom).toBeLessThanOrEqual(s.chips.y);
    expect(s.head.bottom).toBeLessThanOrEqual(s.ruler.y + 1);
    await expect(page.locator(".story-cta")).toHaveAttribute("inert", "");
    expect(await overflowsHorizontally(page)).toBe(false);
    await page.locator('[data-satellite="noaa20"]').click();
    await expect(page.getByRole("dialog").getByRole("heading", { name: "NOAA-20" })).toBeVisible();
    expect(problems).toEqual([]);
  });

  test("with reduced motion the sections are stacked, with no pinned stage", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1280, height: 800 });
    await open(page, "#/");
    expect((await storyState(page)).mode).toBe("stacked");
    await expect(page.locator(".landing-story")).toHaveCount(0);
    await expect(page.getByRole("region", { name: "The broken ruler" }).locator("figcaption")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Our solution" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Start here" })).toBeVisible();
  });

  test("the Start here path links to methods, the picker, and a region's downloads", async ({ page }) => {
    await open(page, "#/");
    const mission = page.getByRole("region", { name: "Start here" });
    await expect(mission.getByRole("link", { name: /Read the methods/ })).toHaveAttribute(
      "href",
      "#/methods",
    );
    await expect(mission.getByRole("link", { name: /Pick a place/ })).toHaveAttribute("href", "#/pick");
    await mission.getByRole("link", { name: /Downloads for/ }).click();
    await expect(page).toHaveURL(/#\/r\/alpha/);
    await expect(page.locator("#downloads")).toBeInViewport({ ratio: 0.1, timeout: 8000 });
  });
});

test.describe("landing loader", () => {
  const loader = (page) => page.getByTestId("landing-loader");

  test("shows on a full page load, fades to the page, and shows again after a refresh", async ({ page }) => {
    const problems = watch(page);
    await serveData(page, { sample: false, showLoader: true });
    await page.goto("./#/");
    await expect(loader(page)).toBeVisible();
    await expect(page.locator("h1#landing-title")).toHaveCount(1);
    await expect(page).toHaveTitle("Prometheus Torch");
    await expect(loader(page)).toHaveCount(0, { timeout: 12000 });
    await page.reload();
    await expect(loader(page)).toBeVisible();
    await expect(loader(page)).toHaveCount(0, { timeout: 12000 });
    expect(problems).toEqual([]);
  });

  test("tells the story with the years from ruler.json, and Skip ends it at once", async ({ page }) => {
    await serveData(page, { sample: false, showLoader: true });
    await page.route("**/textures/**", () => {}); // hold the Earth texture: the loader waits, side by side
    await page.goto("./#/");
    const l = loader(page);
    await expect(l).toBeVisible();
    await expect(page.getByText("Loading FireRosetta")).toHaveAttribute("role", "status");
    await expect(l.locator("canvas")).toHaveAttribute("aria-hidden", "true");
    // e2e ruler rows run 2003 to 2025, switching sensor in 2012 (e2e/fixtures.js).
    // The counter runs to the last year in the file, and the spheres have split by then.
    await expect(l).toHaveAttribute("data-year", "2025", { timeout: 6000 });
    await expect(l).toHaveAttribute("data-stage", "split"); // still waiting for the globe
    await page.getByRole("button", { name: "Skip" }).focus();
    await page.keyboard.press("Enter");
    await expect(l).toHaveCount(0, { timeout: 2000 });
  });

  test("keeps the SAMPLE DATA banner visible above it", async ({ page }) => {
    await serveData(page, { sample: true, showLoader: true });
    await page.goto("./#/");
    const banner = page.getByTestId("sample-banner");
    await expect(banner).toBeVisible();
    await expect(loader(page)).toBeVisible();
    const box = await banner.boundingBox();
    const onTop = await page.evaluate(
      ([x, y]) => Boolean(document.elementFromPoint(x, y)?.closest('[data-testid="sample-banner"]')),
      [box.x + box.width / 2, box.y + box.height / 2],
    );
    expect(onTop).toBe(true);
  });

  test("not on other pages, and not when coming back to #/ inside the app", async ({ page }) => {
    await serveData(page, { sample: false, showLoader: true });
    await page.goto("./#/pick");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(loader(page)).toHaveCount(0);
    await page.getByRole("link", { name: "Prometheus Torch" }).click();
    await expect(page.locator("h1#landing-title")).toBeVisible();
    await page.waitForTimeout(300);
    await expect(loader(page)).toHaveCount(0);
  });

  test("is skipped with reduced motion; ?loader=1 forces it on", async ({ page }) => {
    await serveData(page, { sample: false, showLoader: true });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("./#/");
    await expect(page.locator("h1#landing-title")).toBeVisible();
    await page.waitForTimeout(300);
    await expect(loader(page)).toHaveCount(0);
    await page.goto("./?loader=1#/");
    await expect(loader(page)).toBeVisible();
  });

  test("never blocks: if the Earth texture never arrives, it finishes after 8 s and shows the static Earth", async ({
    page,
  }) => {
    test.setTimeout(30_000);
    await serveData(page, { sample: false, showLoader: true });
    await page.route("**/textures/**", () => {}); // never answered
    const t0 = Date.now();
    await page.goto("./#/");
    await expect(loader(page)).toBeVisible();
    await expect(loader(page)).toHaveCount(0, { timeout: 14000 });
    const took = Date.now() - t0;
    expect(took).toBeGreaterThan(7500);
    expect(took).toBeLessThan(12500);
    await expect(page.getByTestId("static-earth")).toBeVisible();
    await expect(page.locator('[data-testid="globe-stage"] canvas')).toHaveCount(0);
    await page.locator('[data-satellite="aqua"]').click();
    await expect(page.getByRole("dialog").getByRole("heading", { name: "Aqua" })).toBeVisible();
  });
});

test.describe("landing live this week", () => {
  test("loads nowcast.json right away (the loader waits for it) and shows the card with a link to the region", async ({
    page,
  }) => {
    await skipLoader(page);
    await serveData(page, { sample: false });
    const problems = watch(page);
    const nowcastRequests = [];
    page.on("request", (r) => r.url().includes("/nowcast.json") && nowcastRequests.push(r.url()));
    await open(page, "#/");
    // requested at once, not when the card scrolls into view
    await expect.poll(() => nowcastRequests.some((u) => u.includes("/alpha/nowcast.json"))).toBe(true);
    const card = page.getByRole("region", { name: "Alpha test region" });
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect(card).toBeVisible();
    await expect(card.getByText("Live this week")).toBeVisible();
    await expect(card.getByText("Test nowcast sentence.")).toBeVisible();
    expect(nowcastRequests.some((u) => u.includes("/alpha/nowcast.json"))).toBe(true);
    await expect(card.getByRole("link", { name: "See the full picture" })).toHaveAttribute(
      "href",
      "#/r/alpha",
    );
    expect(await overflowsHorizontally(page)).toBe(false);
    expect(problems).toEqual([]);
  });
});

test.describe("landing problem -> solution stage", () => {
  test.beforeEach(async ({ page }) => {
    await serveData(page, { sample: false });
  });

  const stageTop = (page) =>
    page.evaluate(
      () => document.querySelector(".problem-story").getBoundingClientRect().top + window.scrollY,
    );
  const stage = (page) => page.getByTestId("problem-stage");

  test("nothing moves below the threshold; past it the solution plays by itself; back reverses", async ({
    page,
  }) => {
    const problems = watch(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await open(page, "#/");
    const top = await stageTop(page);
    await page.evaluate((y) => window.scrollTo(0, y), top + 0.1 * 800);
    await page.waitForTimeout(700);
    await expect(stage(page)).toHaveAttribute("data-t", "0");
    await expect(stage(page)).toHaveAttribute("data-state", "problem");
    await expect(stage(page).getByRole("img", { name: /joined record jumps/ })).toBeVisible();

    await page.evaluate((y) => window.scrollTo(0, y), top + 0.35 * 800);
    await expect(stage(page)).toHaveAttribute("data-t", "1", { timeout: 4000 });
    await expect(stage(page)).toHaveAttribute("data-state", "solution");
    await expect(stage(page).getByRole("img", { name: /one harmonized record/ })).toBeVisible();

    await page.evaluate((y) => window.scrollTo(0, y), top - 300);
    await expect(stage(page)).toHaveAttribute("data-t", "0", { timeout: 4000 });
    expect(await overflowsHorizontally(page)).toBe(false);
    expect(problems).toEqual([]);
  });

  test("with reduced motion the problem and the solution are two stacked sections", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await open(page, "#/");
    await expect(page.locator(".problem-story")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "The problem" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Our solution" })).toBeVisible();
    await expect(
      page.getByTestId("solution-section").getByRole("img", { name: /one harmonized record/ }),
    ).toBeVisible();
  });
});

test.describe("landing ready before the loader goes", () => {
  test("right after the loader: no skeletons, the globe drawn, no new landing requests for a second", async ({
    page,
  }) => {
    test.setTimeout(40_000);
    const problems = watch(page);
    await serveData(page, { sample: false, showLoader: true });
    await page.goto("./#/?loader=1");
    const loader = page.getByTestId("landing-loader");
    await expect(loader).toBeVisible();
    // While it is up, the page underneath is hidden from screen readers and the keyboard.
    await expect(page.locator("#root main")).toHaveAttribute("inert", "");
    // Wait until every readiness task is done (data-pending empty): that is the normal end. Under heavy parallel test
    // load the 8 s limit can end the loader first; then the static-globe fallback loads, which is a different case.
    const pendingAtEnd = await page.evaluate(
      () =>
        new Promise((resolve) => {
          let last = "";
          const id = setInterval(() => {
            const l = document.querySelector('[data-testid="landing-loader"]');
            if (!l) {
              clearInterval(id);
              resolve(last);
            } else last = l.getAttribute("data-pending") ?? "";
          }, 20);
        }),
    );
    await expect(loader).toHaveCount(0, { timeout: 15000 });
    test.skip(pendingAtEnd !== "", `the 8 s limit ended the loader with tasks pending: ${pendingAtEnd}`);

    // 1. Nothing is still loading on the landing page.
    const loading = await page.evaluate(
      () =>
        document.querySelectorAll(
          '#root [data-state="loading"], #root [role="status"][aria-label^="Loading"]',
        ).length,
    );
    expect(loading).toBe(0);
    await expect(page.locator("#root main")).not.toHaveAttribute("inert", "");

    // 2. The globe has drawn: the scene reported its frames, and the stage is not a blank picture.
    const stage = page.getByTestId("globe-stage");
    await expect(stage).toHaveAttribute("data-drawn", "true");
    const png = await stage.screenshot();
    expect(png.length).toBeGreaterThan(20_000); // a flat, empty area compresses to a few kB

    // 3. No new requests for landing assets in the next second (listed by name, so a failure says which).
    const names = () => page.evaluate(() => performance.getEntriesByType("resource").map((e) => e.name));
    const before = await names();
    await page.waitForTimeout(1000);
    expect((await names()).slice(before.length)).toEqual([]);
    expect(problems).toEqual([]);
  });
});
