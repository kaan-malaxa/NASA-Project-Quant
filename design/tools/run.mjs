// R6 tooling: accessibility checks and exports for prompt E1. Uses only packages already installed in
// web/ (vite, @vitejs/plugin-react, playwright). Works the same on Windows, Ubuntu and macOS.
//
//   node design/tools/run.mjs check  [--public <dir>] [--region <id>]
//   node design/tools/run.mjs export [--public <dir>] [--region <id>]
//
// --public is a folder that contains data/ (default: web/public, where R1 publishes).
// check  → design/a11y/: colour-vision screenshots, keyboard / reduced-motion / print results (JSON + PNG + PDF)
// export → design/exports/: 1920×1080 slides and the 1200×630 Open Graph image. If the data is sample data
//          (manifest code_version "sample"), files go to design/exports/draft-sample/ with a visible tag,
//          never to design/exports/ (AGENTS.md science rule 10; E1 asks for real data).
// Playwright browsers: run `npx playwright install chromium` in web/ once.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..");
const WEB = path.join(REPO, "web");
const NM = path.join(WEB, "node_modules");
const DESIGN = path.join(REPO, "design");

const args = process.argv.slice(2);
const cmd = args[0];
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : dflt;
};
const PUBLIC = path.resolve(opt("public", path.join(WEB, "public")));
const REGION = opt("region", "");
if (!["check", "export"].includes(cmd)) {
  console.error(
    "usage: node design/tools/run.mjs check|export [--public <dir>] [--region <id>]",
  );
  process.exit(2);
}
if (!fs.existsSync(path.join(PUBLIC, "data", "regions.json"))) {
  console.error(
    `No data/regions.json under ${PUBLIC}. Pass --public <folder that contains data/>.`,
  );
  process.exit(2);
}

// ---- load tools from web/node_modules ----
async function importPkg(name) {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(NM, name, "package.json"), "utf8"),
  );
  const exp = pkg.exports?.["."] ?? pkg.exports;
  const entry =
    (typeof exp === "string"
      ? exp
      : (exp?.import?.default ?? exp?.import ?? exp?.default)) ??
    pkg.module ??
    pkg.main;
  return import(pathToFileURL(path.join(NM, name, entry)).href);
}
const vite = await importPkg("vite");
const react = (await importPkg("@vitejs/plugin-react")).default;
const { chromium } = createRequire(path.join(WEB, "package.json"))(
  "playwright",
);

// ---- build and serve the harness ----
const OUT = path.join(os.tmpdir(), "firerosetta-r6-harness");
const config = {
  configFile: false,
  root: path.join(HERE, "harness"),
  base: "./",
  publicDir: PUBLIC,
  logLevel: "warn",
  plugins: [react()],
  resolve: {
    // The harness lives outside web/, so its own bare imports are pointed at web/node_modules.
    alias: [
      {
        find: /^(react-dom|react|@fontsource-variable\/inter)(\/.*)?$/,
        replacement: `${NM.replaceAll("\\", "/")}/$1$2`,
      },
    ],
  },
  build: { outDir: OUT, emptyOutDir: true, chunkSizeWarningLimit: 4000 },
  preview: { port: 4179, strictPort: false, host: "127.0.0.1" },
};
await vite.build(config);
const server = await vite.preview(config);
const URL0 = server.resolvedUrls.local[0];

const regions = JSON.parse(
  fs.readFileSync(path.join(PUBLIC, "data", "regions.json"), "utf8"),
);
const region = REGION || regions.regions[0].id;
const page = async (browser, query, viewport, extra = {}) => {
  const ctx = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    ...extra,
  }); // extra may set deviceScaleFactor
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(String(e)));
  await p.goto(`${URL0}?${query}`);
  return { ctx, p, errors };
};
const launch = () =>
  chromium.launch({
    args: [
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      "--ignore-gpu-blocklist",
    ],
  });
const mkdir = (d) => fs.mkdirSync(d, { recursive: true });

try {
  if (cmd === "export") await runExport();
  else await runCheck();
} finally {
  await server.close();
}

// ---------------------------------------------------------------------------------------
async function runExport() {
  const browser = await launch();
  const charts = [
    "ruler",
    "clock",
    "calendar-activity",
    "calendar-anomaly",
    "verdict",
    "this-week",
    "drift",
    "eyesight",
    "agreement",
    "hexmap",
  ];
  let sample = null;
  let dir = null;
  const written = [];
  for (const id of [...charts, "og"]) {
    const og = id === "og";
    const { ctx, p, errors } = await page(
      browser,
      og
        ? `view=og&region=${region}`
        : `view=chart&chart=${id}&region=${region}`,
      // Laid out at 1280×720 (OG 800×420) and captured at 1.5×: 1920×1080 (1200×630) files whose text is
      // 1.5× larger, so slides and the video stay readable.
      og ? { width: 800, height: 420 } : { width: 1280, height: 720 },
      { reducedMotion: "reduce", deviceScaleFactor: 1.5 },
    );
    await p.waitForSelector("[data-ready], [data-error]", { timeout: 20000 });
    const err = await p.locator("[data-error]").count() ? await p.locator("[data-error]").textContent() : null;
    if (err) throw new Error(`${id}: ${err}`);
    if (sample === null) {
      sample =
        (await p.locator("[data-ready]").getAttribute("data-sample")) === "1";
      dir = sample
        ? path.join(DESIGN, "exports", "draft-sample")
        : path.join(DESIGN, "exports");
      mkdir(dir);
    }
    await p.waitForTimeout(id === "hexmap" ? 9000 : 1500);
    const file = path.join(
      dir,
      `${og ? "og-image" : id}${og ? "-1200x630" : "-1920x1080"}.png`,
    );
    await p.screenshot({ path: file });
    written.push({
      id,
      file: path.relative(REPO, file).replaceAll("\\", "/"),
      errors,
    });
    await ctx.close();
  }
  await browser.close();
  console.log(JSON.stringify({ region, sample, written }, null, 2));
  if (sample)
    console.log(
      "\nSAMPLE data: wrote drafts only. Re-run on real data for design/exports/.",
    );
}

// ---------------------------------------------------------------------------------------
async function runCheck() {
  const out = path.join(DESIGN, "a11y");
  mkdir(out);
  const browser = await launch();
  const results = {
    region,
    colourVision: [],
    keyboard: {},
    reducedMotion: {},
    print: {},
  };

  // 1. Colour vision: Chrome's own emulation (the same as DevTools → Rendering).
  const VISIONS = [
    "none",
    "protanopia",
    "deuteranopia",
    "tritanopia",
    "achromatopsia",
  ];
  for (const chart of ["calendar-activity", "calendar-anomaly", "clock"]) {
    const { ctx, p } = await page(
      browser,
      `view=chart&chart=${chart}&region=${region}`,
      { width: 1280, height: 720 },
    );
    await p.waitForSelector("[data-ready]");
    await p.waitForTimeout(800);
    const cdp = await ctx.newCDPSession(p);
    for (const v of VISIONS) {
      await cdp.send("Emulation.setEmulatedVisionDeficiency", { type: v });
      await p.waitForTimeout(200);
      const file = path.join(
        out,
        `cvd_${chart}_${v === "none" ? "normal" : v}.png`,
      );
      await p.screenshot({ path: file });
      results.colourVision.push(
        path.relative(REPO, file).replaceAll("\\", "/"),
      );
    }
    await ctx.close();
  }

  // 3. Keyboard, on the Gallery (every chart, every state).
  {
    const { ctx, p, errors } = await page(browser, "view=gallery", {
      width: 1280,
      height: 900,
    });
    await p.waitForSelector("svg.fr-viz");
    await p.waitForTimeout(2500);
    const charts = await p.evaluate(() =>
      [...document.querySelectorAll(".fr-viz")].map((el) => ({
        tag: el.tagName.toLowerCase(),
        name: (el.getAttribute("aria-label") ?? "").slice(0, 40),
        focusable:
          el.tabIndex >= 0 ||
          !!el.querySelector("[tabindex='0'], button, canvas[tabindex]"),
      })),
    );
    results.keyboard.chartsTotal = charts.length;
    results.keyboard.unreachable = charts
      .filter((c) => !c.focusable)
      .map((c) => c.name);

    // Focus ring visible on a static chart.
    // Real Tab presses from the top of the page until a static chart (role=img) has focus.
    await p.evaluate(() => document.activeElement?.blur());
    let ring = null;
    for (let i = 0; i < 40 && !ring; i++) {
      await p.keyboard.press("Tab");
      ring = await p.evaluate(() => {
        const a = document.activeElement;
        if (!a?.matches?.("svg.fr-viz[role=img]")) return null;
        const s = getComputedStyle(a);
        return {
          chart: (a.getAttribute("aria-label") ?? "").slice(0, 40),
          outline: `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor}`,
          offset: s.outlineOffset,
        };
      });
    }
    results.keyboard.staticChartFocusOutline = ring;

    // Calendar and clock: arrows move, Enter selects, Escape closes the tooltip.
    for (const label of ["calendar", "clock"]) {
      const grids = p.locator("svg.fr-viz[role=grid]");
      const n = await grids.count();
      // the clock is the grid whose aria-label starts with "Fire year clock"
      let target = null;
      for (let i = 0; i < n; i++) {
        const name = (await grids.nth(i).getAttribute("aria-label")) ?? "";
        if (
          label === "clock"
            ? name.startsWith("Fire year clock")
            : name.startsWith("Calendar")
        ) {
          target = grids.nth(i);
          break;
        }
      }
      if (!target) {
        results.keyboard[label] = "not found";
        continue;
      }
      await target.focus();
      const before = await target.getAttribute("aria-activedescendant");
      await p.keyboard.press("ArrowLeft");
      await p.keyboard.press("ArrowUp");
      const after = await target.getAttribute("aria-activedescendant");
      const tipShown = await target
        .locator("g[pointer-events='none'] rect[rx='6']")
        .count();
      await p.keyboard.press("Enter");
      await p.waitForTimeout(150);
      const events = await p.evaluate(
        () =>
          [...document.querySelectorAll("p")].find((e) =>
            e.textContent.startsWith("Events:"),
          )?.textContent ?? "",
      );
      await p.keyboard.press("Escape");
      await p.waitForTimeout(100);
      const tipAfterEsc = await target
        .locator("g[pointer-events='none'] rect[rx='6']")
        .count();
      const focusRing = await target
        .locator("rect")
        .evaluateAll(
          (rs) =>
            rs.filter((r) =>
              (r.style.stroke || "").includes("--fr-focus-color"),
            ).length,
        );
      results.keyboard[label] = {
        arrowsMoveActiveCell: before !== after,
        enterCallsOnSelect: /onSelect/.test(events),
        // The clock has no tooltip: the focused cell is described in its centre text (spec 9.5).
        tooltipShownOnFocus:
          label === "clock" ? "n/a (centre text)" : tipShown > 0,
        escapeClosesTooltip:
          label === "clock"
            ? "n/a (centre text)"
            : tipShown > 0 && tipAfterEsc === 0,
        focusOutlineOnCell: focusRing > 0 || label === "clock",
      };
    }
    results.keyboard.pageErrors = errors;
    await ctx.close();
  }

  // 4. Reduced motion: the ruler animation is skipped and the end state carries all the information.
  for (const motion of ["reduce", "no-preference"]) {
    const { ctx, p } = await page(
      browser,
      "view=gallery",
      { width: 1280, height: 900 },
      { reducedMotion: motion },
    );
    await p.waitForSelector("svg.fr-viz");
    const harmonizedLabel = () =>
      p.evaluate(() => {
        // the BrokenRuler is the chart with the "Raw record, as downloaded" end label
        const svg = [...document.querySelectorAll("svg.fr-viz")].find((s) =>
          [...s.querySelectorAll("text")].some(
            (x) => x.textContent === "Raw record, as downloaded",
          ),
        );
        const t =
          svg &&
          [...svg.querySelectorAll("text")].find(
            (x) => x.textContent === "Harmonized",
          );
        return t ? getComputedStyle(t).opacity : null;
      });
    await p.waitForTimeout(150);
    const early = await harmonizedLabel();
    await p.waitForTimeout(4000);
    const late = await harmonizedLabel();
    results.reducedMotion[motion] = {
      harmonizedLabelOpacityAt150ms: early,
      after4s: late,
    };
    await ctx.close();
  }

  // 5. Print (@media print) and .brief: light theme, dark text, hatch kept.
  for (const chart of ["calendar-activity", "clock", "drift"]) {
    for (const mode of ["print", "brief"]) {
      const { ctx, p } = await page(
        browser,
        `view=chart&chart=${chart}&region=${region}${mode === "brief" ? "&theme=brief" : ""}`,
        { width: 1280, height: 720 },
      );
      await p.waitForSelector("[data-ready]");
      if (mode === "print") await p.emulateMedia({ media: "print" });
      await p.waitForTimeout(600);
      const info = await p.evaluate(() => {
        const chart = document.querySelector("[data-chart] .fr-viz");
        const cs = getComputedStyle(chart);
        const text = [...chart.querySelectorAll("text")][0];
        return {
          bg: cs.getPropertyValue("--fr-bg").trim(),
          textColour: cs.getPropertyValue("--fr-text").trim(),
          firstTextFill: text ? getComputedStyle(text).fill : null,
          hatchPattern: !!chart.querySelector("pattern#fr-hatch"),
          hatchedMarks: chart.querySelectorAll("[style*='fr-hatch']").length,
        };
      });
      const file = path.join(out, `${mode}_${chart}.png`);
      await p.screenshot({ path: file });
      results.print[`${mode}:${chart}`] = {
        ...info,
        screenshot: path.relative(REPO, file).replaceAll("\\", "/"),
      };
      if (mode === "print" && chart === "calendar-activity") {
        const pdf = path.join(out, "print_calendar.pdf");
        await p.pdf({
          path: pdf,
          width: "1280px",
          height: "720px",
          printBackground: false,
        });
        results.print.pdf = path.relative(REPO, pdf).replaceAll("\\", "/");
      }
      await ctx.close();
    }
  }

  await browser.close();
  fs.writeFileSync(
    path.join(out, "check_results.json"),
    JSON.stringify(results, null, 2) + "\n",
  );
  console.log(JSON.stringify(results, null, 2));
}
