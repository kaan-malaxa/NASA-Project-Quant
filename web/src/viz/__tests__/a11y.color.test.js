// E1 · colour vision and contrast, measured from tokens.css and theme.js (not by eye).
// - Contrast: WCAG 2.x relative-luminance ratio.
// - Colour vision: Machado, Oliveira & Fernandes (2009) matrices at severity 1.0 for protanopia,
//   deuteranopia and tritanopia (the model Chrome DevTools uses), applied in linear RGB; achromatopsia
//   as relative luminance. Distance between two colours: CIE76 ΔE in CIELAB.
// Run with A11Y_PRINT=1 to print the tables used in design/a11y_check.md.

import fs from "node:fs";
import path from "node:path";
import { lab, rgb } from "d3";
import { describe, expect, it } from "vitest";
import { ACTIVITY_DOMAIN_QUANTILE, activityInterpolator, anomalyInterpolator } from "../theme";

// Tests run from web/ (npm run test); the path is built with path.join so it works on every OS.
const CSS = fs.readFileSync(path.join(process.cwd(), "src", "styles", "tokens.css"), "utf8");

/** Literal hex colour tokens declared in the first block that starts with `selector {`. */
function block(startPattern) {
  const i = CSS.search(startPattern);
  if (i < 0) throw new Error(`no block ${startPattern}`);
  const body = CSS.slice(CSS.indexOf("{", i) + 1, CSS.indexOf("}", i));
  const out = {};
  for (const m of body.matchAll(/(--fr-[\w-]+)\s*:\s*(#[0-9a-fA-F]{6})/g)) out[m[1]] = m[2];
  return out;
}
const DARK = block(/^:root \{/m);
// The light theme is the `.brief {` block that sets color-scheme (an earlier `:root, .brief {` block
// holds only derived tokens).
const BRIEF = /^\.brief \{\s*color-scheme: light/m;
const LIGHT = { ...DARK, ...block(BRIEF) };
const PRINT = { ...DARK, ...block(/@media print \{\s*:root \{/m) };
const THEMES = { dark: DARK, light: LIGHT };

// ---- colour maths ----
const lin = (c) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const unlin = (v) => {
  const c = Math.min(1, Math.max(0, v));
  return 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
};
const luminance = (hex) => {
  const c = rgb(hex);
  return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
};
export const contrast = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const MACHADO = {
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};
const VISIONS = ["normal", "protanopia", "deuteranopia", "tritanopia", "achromatopsia"];
function simulate(color, vision) {
  const c = rgb(color);
  const v = [lin(c.r), lin(c.g), lin(c.b)];
  if (vision === "normal") return rgb(c.r, c.g, c.b);
  if (vision === "achromatopsia") {
    const y = unlin(0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]);
    return rgb(y, y, y);
  }
  const m = MACHADO[vision];
  const o = m.map((row) => row[0] * v[0] + row[1] * v[1] + row[2] * v[2]);
  return rgb(unlin(o[0]), unlin(o[1]), unlin(o[2]));
}
const deltaE = (a, b) => {
  const p = lab(a);
  const q = lab(b);
  return Math.hypot(p.l - q.l, p.a - q.a, p.b - q.b);
};
const dE = (a, b, vision) => deltaE(simulate(a, vision), simulate(b, vision));

// Ramp positions that matter for reading: the sqrt activity scale puts the lowest non-zero cells
// near t = sqrt(1/p99-ish); use t = 0.05 ("lowest") and t = 1 ("highest"). Anomaly: 10th / 50th / 90th.
const LOW = activityInterpolator(0.05);
const HIGH = activityInterpolator(1);
const MID = activityInterpolator(0.5);
const QUIET = anomalyInterpolator(0.1);
const NEUTRAL = anomalyInterpolator(0.5);
const BUSY = anomalyInterpolator(0.9);

/** Colour distinctions the charts rely on (item 1 of prompt E1). Pattern-coded ones are listed too. */
function distinctions(t) {
  return [
    { name: "low vs high activity", a: LOW, b: HIGH, min: 20 },
    { name: "low vs middle activity", a: LOW, b: MID, min: 10 },
    // Zero is the surface colour plus an outline (ZERO_STYLE). In the dark theme the fill has the same
    // lightness as the lowest ramp colour, so the outline is the cue that must survive.
    { name: "zero outline vs lowest activity", a: t["--fr-zero-stroke"], b: LOW, min: 15 },
    { name: "quieter vs busier (10th vs 90th pct)", a: QUIET, b: BUSY, min: 15 },
    { name: "quieter vs typical", a: QUIET, b: NEUTRAL, min: 10 },
    { name: "busier vs typical", a: BUSY, b: NEUTRAL, min: 10 },
    // No data is a hatch (pattern), so what must survive is the hatch line against its background.
    { name: "no-data hatch lines vs hatch background", a: t["--fr-muted"], b: t["--fr-bg"], min: 20 },
    // Estimate is a dashed outline (pattern); the dash must stand out from the page.
    { name: "estimate dashed outline vs page", a: t["--fr-text"], b: t["--fr-bg"], min: 20 },
  ];
}

const PRINT_TABLES = process.env.A11Y_PRINT === "1";

describe("colour vision (Machado 2009 / luminance), both themes", () => {
  for (const [theme, t] of Object.entries(THEMES)) {
    it(`${theme}: every distinction keeps ΔE above its floor in all four simulations`, () => {
      const rows = distinctions(t).map((d) => ({
        name: d.name,
        min: d.min,
        ...Object.fromEntries(VISIONS.map((v) => [v, Math.round(dE(d.a, d.b, v))])),
      }));
      if (PRINT_TABLES) {
        console.log(`\n${theme}\n| Distinction | floor | ${VISIONS.join(" | ")} |`);
        for (const r of rows)
          console.log(`| ${r.name} | ${r.min} | ${VISIONS.map((v) => r[v]).join(" | ")} |`);
      }
      for (const r of rows)
        for (const v of VISIONS) expect(r[v], `${theme} · ${r.name} · ${v}`).toBeGreaterThanOrEqual(r.min);
    });
  }
});

describe("contrast (WCAG ratio), both themes and print", () => {
  // [foreground token, background token, minimum, what it is]
  const PAIRS = [
    ["--fr-text", "--fr-bg", 4.5, "body text on page"],
    ["--fr-text", "--fr-surface", 4.5, "body text on cards / tooltips"],
    ["--fr-muted", "--fr-bg", 4.5, "muted text (captions, axis labels) on page"],
    ["--fr-muted", "--fr-surface", 4.5, "muted text on cards"],
    ["--fr-axis", "--fr-bg", 3, "chart axis lines"],
    ["--fr-axis", "--fr-surface", 3, "chart axis lines on cards"],
    ["--fr-accent", "--fr-bg", 3, "focus ring / harmonized line"],
    ["--fr-accent", "--fr-surface", 3, "focus ring on cards"],
    ["--fr-warning", "--fr-bg", 3, "warning line + large label"],
    ["--fr-muted", "--fr-bg", 3, "no-data hatch lines"],
    ["--fr-status-below-normal", "--fr-bg", 3, "status headline: below normal"],
    ["--fr-status-normal", "--fr-bg", 3, "status headline: normal"],
    ["--fr-status-above-normal", "--fr-bg", 3, "status headline: above normal"],
    ["--fr-status-extreme", "--fr-bg", 3, "status headline: extreme"],
    ["--fr-status-low-activity", "--fr-bg", 3, "status headline: low activity"],
    ["--fr-sensor-aqua", "--fr-bg", 3, "sensor line / swatch: Aqua"],
    ["--fr-sensor-snpp", "--fr-bg", 3, "sensor line / swatch: S-NPP"],
    ["--fr-sensor-noaa20", "--fr-bg", 3, "sensor line / swatch: NOAA-20"],
  ];
  for (const [theme, t] of Object.entries({ dark: DARK, light: LIGHT, print: PRINT })) {
    it(`${theme}: every pair meets its minimum`, () => {
      const rows = PAIRS.map(([fg, bg, min, what]) => ({ fg, bg, min, what, ratio: contrast(t[fg], t[bg]) }));
      if (PRINT_TABLES) {
        console.log(`\n${theme}\n| What | colours | ratio | needs |`);
        for (const r of rows)
          console.log(`| ${r.what} | ${t[r.fg]} on ${t[r.bg]} | ${r.ratio.toFixed(2)}:1 | ${r.min}:1 |`);
      }
      for (const r of rows) expect(r.ratio, `${theme} · ${r.what}`).toBeGreaterThanOrEqual(r.min);
    });
  }

  it("print redefines the same tokens as .brief (the light theme)", () => {
    const keys = Object.keys(block(BRIEF));
    expect(keys.length).toBeGreaterThan(10);
    for (const k of keys) expect(PRINT[k], k).toBe(LIGHT[k]);
    expect(LIGHT["--fr-bg"]).toBe("#ffffff");
  });

  it("the activity domain quantile is still the C1 choice", () => {
    expect(ACTIVITY_DOMAIN_QUANTILE).toBe(0.99);
  });
});
