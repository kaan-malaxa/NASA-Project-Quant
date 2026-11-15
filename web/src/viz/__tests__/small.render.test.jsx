// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { FIXTURE_NOWCAST_VARIANTS, FIXTURE_TREND, FIXTURE_TREND_VARIANTS } from "../gallery/fixtures";
import { KindBadge, Legend, PercentileStrip, TrendBars } from "../index";

afterEach(cleanup);

const KINDS = ["observed", "harmonized", "estimated", "missing", "sample"];

describe("KindBadge", () => {
  it("each kind has its own text, icon and border style (not only colour)", () => {
    const looks = KINDS.map((kind) => {
      const { container } = render(<KindBadge kind={kind} />);
      const el = container.querySelector("[data-kind]");
      return { text: el.textContent, border: el.style.border, icon: el.querySelector("svg")?.getAttribute("class") };
    });
    expect(new Set(looks.map((l) => l.text)).size).toBe(5);
    expect(new Set(looks.map((l) => l.icon)).size).toBe(5);
    expect(looks.find((_, i) => KINDS[i] === "estimated").border).toContain("dashed");
    expect(looks.find((_, i) => KINDS[i] === "sample").border).toContain("dotted");
  });
});

describe("Legend", () => {
  it("anomaly: quieter / typical / busier, plus no data and estimate swatches", () => {
    const { container } = render(<Legend scale="anomaly" unit="u" />);
    const text = container.textContent;
    for (const t of ["quieter than usual", "typical", "busier than usual", "no data", "estimate"]) expect(text).toContain(t);
  });
  it("activity: 0, highest and the unit", () => {
    const { container } = render(<Legend scale="activity" unit="fire cell-days per week" />);
    const text = container.textContent;
    for (const t of ["0", "highest", "fire cell-days per week", "no data", "estimate"]) expect(text).toContain(t);
  });
});

describe("TrendBars", () => {
  it("says 'no clear change' for a range across zero, and shows ranges", () => {
    const ref = createRef();
    const { container } = render(<TrendBars ref={ref} trend={FIXTURE_TREND} />);
    expect(ref.current.tagName.toLowerCase()).toBe("svg");
    const aria = container.querySelector("svg").getAttribute("aria-label");
    expect(aria).toContain("Harmonized: no clear change (range −4% to +9%)");
    expect(aria).toContain("Raw record: +34% per decade (range +21% to +47%)");
  });
  it("renders every variant", () => {
    for (const v of FIXTURE_TREND_VARIANTS) render(<TrendBars trend={v.trend} />);
  });
});

describe("PercentileStrip", () => {
  it("draws one tick per past year with data (missing years skipped)", () => {
    const v = FIXTURE_NOWCAST_VARIANTS.find((x) => x.label === "normal").nowcast;
    const { container } = render(<PercentileStrip nowcast={v} />);
    const withData = v.history.filter((h) => h.value !== null).length;
    // ticks are the vertical lines inside the strip; the marker is the thicker one
    const lines = [...container.querySelectorAll("line")].filter((l) => l.style.strokeWidth === "1");
    expect(lines).toHaveLength(withData);
  });
  it("calm empty state for low_activity and unavailable: the sentence only", () => {
    for (const label of ["low activity (empty state)", "unavailable (empty state)"]) {
      const v = FIXTURE_NOWCAST_VARIANTS.find((x) => x.label === label).nowcast;
      const { container } = render(<PercentileStrip nowcast={v} />);
      // no strip, no ticks, no marker (the status icon's own drawing is not counted)
      expect(container.querySelectorAll("svg.fr-viz > g line")).toHaveLength(0);
      expect(container.querySelectorAll("svg.fr-viz path[d^='M']").length).toBeLessThanOrEqual(2);
      expect(container.textContent.replace(/\s+/g, " ")).toContain(v.sentence.split(" ").slice(0, 3).join(" "));
    }
  });
});
