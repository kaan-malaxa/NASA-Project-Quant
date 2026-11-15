import { describe, expect, it } from "vitest";
import { PX_PER_MM, fitScale } from "./briefFit.js";

describe("fitScale", () => {
  it("leaves a page that fits alone and shrinks one that does not", () => {
    expect(fitScale(200 * PX_PER_MM)).toBe(1);
    expect(fitScale(255 * PX_PER_MM)).toBe(1);
    expect(fitScale(262 * PX_PER_MM)).toBe(0.973); // floor(255 / 262, 3 decimals)
    expect(fitScale(1000 * PX_PER_MM)).toBe(0.75); // never below the minimum
    expect(fitScale(0)).toBe(1);
  });
});
