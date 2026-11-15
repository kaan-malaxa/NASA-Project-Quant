import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { HeldoutAgreement } from "../HeldoutAgreement.jsx";

it("names the excluded year and reports unavailable comparisons", () => {
  const {rerender} = render(<HeldoutAgreement comparison={[{year:2020,week:1,excluded_year:2020,tier1:7,tier2:7}]} />);
  expect(screen.getByRole("img").querySelector("circle").getAttribute("aria-label")).toContain("excluded year 2020");
  rerender(<HeldoutAgreement comparison={[]} />);
  expect(screen.getByText(/unavailable/)).toBeTruthy();
});
