import { describe, expect, it } from "vitest";
import { STATUS_LABELS, statusLabel } from "./labels.js";

describe("status labels", () => {
  it("covers all six nowcast statuses with text", () => {
    const statuses = ["unavailable", "low_activity", "below_normal", "normal", "above_normal", "extreme"];
    expect(Object.keys(STATUS_LABELS).sort()).toEqual([...statuses].sort());
    for (const s of statuses) expect(statusLabel(s).length).toBeGreaterThan(0);
    expect(statusLabel("bogus")).toBe("Unknown status");
  });
});
