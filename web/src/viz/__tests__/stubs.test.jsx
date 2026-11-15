// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { BrokenRuler, DriftChart, KindBadge, Legend, TrendBars } from "../index";

afterEach(cleanup);

describe("component stubs", () => {
  it("forward a ref to the root <svg> and have an accessible name", () => {
    const ref = createRef();
    const ruler = { rows: [], sentence: "The test sentence." };
    const { getByRole } = render(<BrokenRuler ref={ref} ruler={ruler} />);
    expect(ref.current?.tagName.toLowerCase()).toBe("svg");
    expect(getByRole("img").getAttribute("aria-label")).toBe("The test sentence.");
  });

  it("render with empty data without crashing", () => {
    render(<TrendBars trend={{ annual: [] }} />);
    render(<DriftChart drift={[]} region="test_region" trustedThrough="2022-12-31" />);
    render(<Legend scale="anomaly" unit="fire cell-days per week" />);
  });

  it("KindBadge shows text, not only colour", () => {
    const { getByText } = render(<KindBadge kind="missing" />);
    expect(getByText("No data")).toBeTruthy();
  });
});
