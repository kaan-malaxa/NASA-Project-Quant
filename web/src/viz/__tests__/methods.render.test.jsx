// @vitest-environment jsdom
// D1: SeasonShiftChart, EyesightCurve, DriftChart in every state, on small fabricated inputs.
import { cleanup, render } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { DriftChart, EyesightCurve, SeasonShiftChart } from "../index";

afterEach(cleanup);

const range = (value, lo, hi) => ({ value, lo, hi });
const WINDOW = {
  id: "w1",
  label: "early-July to late-September",
  start_week: 27,
  peak_week: 33,
  end_week: 39,
  share: 0.6,
  by_year: [
    { year: 2003, start_doy: 200, centroid_doy: 230, end_doy: 260, total: 10, kind: "observed" },
    { year: 2004, start_doy: 198, centroid_doy: 229, end_doy: 259, total: 10, kind: "observed" },
    { year: 2005, start_doy: null, centroid_doy: null, end_doy: null, total: null, kind: "missing" },
    { year: 2006, start_doy: 196, centroid_doy: 227, end_doy: 258, total: 10, kind: "estimated" },
  ],
  shift_days_per_decade: { start: range(-4, -5, -3), centroid: range(-3, -4, -2), end: range(-1, -3, 1) },
  sentence: "The fabricated season now starts earlier.",
};

describe("SeasonShiftChart", () => {
  it("draws one bar per covered year, hatches missing years, solid/dashed trend lines", () => {
    const ref = createRef();
    const { container } = render(<SeasonShiftChart ref={ref} season={{ windows: [WINDOW] }} />);
    expect(ref.current.tagName.toLowerCase()).toBe("svg");
    expect(container.textContent).toContain("The fabricated season now starts earlier.");
    // start range excludes zero → solid "start"; end range includes zero → dashed "no clear shift"
    expect(container.textContent).toContain("end: no clear shift");
    const hatched = [...container.querySelectorAll("rect")].filter((r) => r.style.fill.includes("#fr-hatch"));
    expect(hatched.length).toBe(1);
    const titles = [...container.querySelectorAll("title")].map((t) => t.textContent);
    expect(titles.some((t) => t.startsWith("2006") && t.includes("(estimate)"))).toBe(true);
    expect(titles.some((t) => t.startsWith("2005"))).toBe(false); // missing is not drawn as a bar
  });

  it("renders nothing when every window has no by_year rows", () => {
    const { container } = render(<SeasonShiftChart season={{ windows: [{ ...WINDOW, by_year: [] }] }} />);
    expect(container.innerHTML).toBe("");
  });

  it("one year: a bar, no trend line", () => {
    const { container } = render(
      <SeasonShiftChart season={{ windows: [{ ...WINDOW, by_year: WINDOW.by_year.slice(0, 1) }] }} />,
    );
    expect(container.textContent).not.toContain("no clear shift");
    expect(container.querySelectorAll("title").length).toBe(1);
  });
});

const EYESIGHT = {
  region: "test",
  status: "validated",
  params: { a: -1.2, b: 2.1, c: 0.82 },
  g: 1.1,
  n_celldays: 1000,
  curve: [
    { frp_mw: 1, p: 0.2, lo: 0.15, hi: 0.25 },
    { frp_mw: 10, p: 0.5, lo: 0.45, hi: 0.55 },
    { frp_mw: 100, p: 0.8, lo: 0.75, hi: 0.85 },
  ],
  binned: [
    { frp_mw: 2, p_obs: 0.3, n: 100 },
    { frp_mw: 20, p_obs: 0.6, n: 25 },
  ],
};

describe("EyesightCurve", () => {
  it("labels the ceiling from params.c and shows the status chip in words", () => {
    const { container } = render(<EyesightCurve eyesight={EYESIGHT} />);
    expect(container.textContent).toContain("Aqua was looking about 82% of the time");
    expect(container.textContent).toContain("Validated");
    const r = [...container.querySelectorAll("circle")].map((c) => Number(c.getAttribute("r")));
    expect(r[0]).toBeGreaterThan(r[1]); // bigger n → bigger dot
  });

  it("exploratory says it is not used; absent is a one-line message", () => {
    const ex = render(<EyesightCurve eyesight={{ ...EYESIGHT, status: "exploratory" }} />);
    expect(ex.container.textContent).toContain("Exploratory");
    cleanup();
    const ref = createRef();
    const ab = render(
      <EyesightCurve ref={ref} eyesight={{ ...EYESIGHT, status: "absent", curve: [], binned: [] }} />,
    );
    expect(ref.current.tagName.toLowerCase()).toBe("svg");
    expect(ab.container.querySelectorAll("text").length).toBe(1);
  });

  it("empty curve says so", () => {
    const { container } = render(<EyesightCurve eyesight={{ ...EYESIGHT, curve: [], binned: [] }} />);
    expect(container.textContent).toContain("No curve data");
  });
});

const DRIFT = [
  { region: "test", sensor: "snpp", year: 2021, k_annual: 0.4, lo: 0.38, hi: 0.42 },
  { region: "test", sensor: "snpp", year: 2022, k_annual: 0.42, lo: 0.4, hi: 0.44 },
  { region: "test", sensor: "snpp", year: 2023, k_annual: null, lo: null, hi: null },
  { region: "test", sensor: "snpp", year: 2024, k_annual: 0.3, lo: 0.28, hi: 0.32 },
  { region: "other", sensor: "snpp", year: 2021, k_annual: 9, lo: 9, hi: 9 },
];

describe("DriftChart", () => {
  it("one region only, trusted line labelled, later years hollow, missing hatched", () => {
    const ref = createRef();
    const { container } = render(
      <DriftChart ref={ref} drift={DRIFT} region="test" trustedThrough="2022-12-31" />,
    );
    expect(ref.current.tagName.toLowerCase()).toBe("svg");
    expect(container.textContent).toContain("We stop trusting Aqua here");
    expect(container.textContent).toContain("2021–2022 average");
    const dots = [...container.querySelectorAll("circle")];
    expect(dots.length).toBe(3); // region "other" and the missing year are not dots
    expect(dots[2].style.fill).toContain("fr-bg"); // 2024: hollow
    expect(dots[0].style.fill).not.toContain("fr-bg");
    const hatched = [...container.querySelectorAll("rect")].filter((r) => r.style.fill.includes("#fr-hatch"));
    expect(hatched.length).toBe(1);
  });

  it("no rows for the region: a message, still an svg", () => {
    const ref = createRef();
    const { container } = render(
      <DriftChart ref={ref} drift={DRIFT} region="none" trustedThrough="2022-12-31" />,
    );
    expect(ref.current.tagName.toLowerCase()).toBe("svg");
    expect(container.textContent).toContain("No calibration drift data");
  });
});
