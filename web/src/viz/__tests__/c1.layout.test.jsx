// @vitest-environment jsdom
// C1 regressions found on R1's sample at 360 px.
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  FIXTURE_CLIMATOLOGY,
  FIXTURE_MONTHLY,
  FIXTURE_NOWCAST,
  FIXTURE_RULER,
  FIXTURE_SEASON,
  FIXTURE_TREND,
  FIXTURE_WEEKLY,
} from "../gallery/fixtures";
import { BrokenRuler, CalendarHeatmap, FireYearClock, PercentileStrip, TrendBars } from "../index";

afterEach(cleanup);

const CHARTS = {
  BrokenRuler: <BrokenRuler ruler={FIXTURE_RULER} animate={false} />,
  CalendarHeatmap: (
    <CalendarHeatmap
      grain="week"
      weekly={FIXTURE_WEEKLY}
      monthly={FIXTURE_MONTHLY}
      climatology={FIXTURE_CLIMATOLOGY}
      season={FIXTURE_SEASON}
      lens="harmonized"
      mode="activity"
    />
  ),
  FireYearClock: (
    <FireYearClock
      weekly={FIXTURE_WEEKLY}
      climatology={FIXTURE_CLIMATOLOGY}
      season={FIXTURE_SEASON}
      lens="harmonized"
      mode="activity"
      currentYear={2026}
    />
  ),
  PercentileStrip: <PercentileStrip nowcast={FIXTURE_NOWCAST} />,
  TrendBars: <TrendBars trend={FIXTURE_TREND} />,
};

describe("hidden data tables", () => {
  // A <table> ignores width: 1px, so .fr-sr-only on the table itself let a 52-column table
  // widen the page to ~18,000 px. The class must sit on a wrapping <div>.
  for (const [name, el] of Object.entries(CHARTS)) {
    it(`${name}: table is inside a .fr-sr-only div, not classed itself`, () => {
      const { container } = render(el);
      expect(container.querySelector("table.fr-sr-only")).toBeNull();
      const table = container.querySelector("table");
      expect(table).not.toBeNull();
      expect(table.parentElement.tagName).toBe("DIV");
      expect(table.parentElement.classList.contains("fr-sr-only")).toBe(true);
    });
  }
});
