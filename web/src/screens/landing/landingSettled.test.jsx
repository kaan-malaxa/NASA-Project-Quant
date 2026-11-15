import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { landingSettled } from "./useLandingReadiness.js";

afterEach(cleanup);

describe("landingSettled", () => {
  const settled = (ui) => landingSettled(render(<div>{ui}</div>).container);

  it("is false while any skeleton or loading state is on the page", () => {
    expect(settled(<div role="status" aria-label="Loading The broken ruler" data-state="loading" />)).toBe(
      false,
    );
    expect(settled(<div role="status" aria-label="Loading BrokenRuler chart" />)).toBe(false);
  });

  it("waits for the broken-ruler chart to draw", () => {
    expect(
      settled(
        <section aria-label="The broken ruler">
          <figure>
            <svg />
          </figure>
        </section>,
      ),
    ).toBe(false);
    expect(
      settled(
        <section aria-label="The broken ruler">
          <figure>
            <svg>
              <path d="M0 0" />
            </svg>
          </figure>
        </section>,
      ),
    ).toBe(true);
  });

  it("a section showing its fallback ('not available') does not hold it", () => {
    expect(
      settled(
        <section aria-label="The broken ruler">
          <div data-state="absent">Not available</div>
        </section>,
      ),
    ).toBe(true);
  });
});
