import { describe, expect, it } from "vitest";
import { fmt3, fmtBytes, fmtInt } from "./format3.js";

describe("format3", () => {
  it("formats numbers and byte sizes", () => {
    expect(fmt3(0.12345)).toBe("0.123");
    expect(fmtInt(1234567)).toBe("1,234,567");
    expect(fmtBytes(512)).toBe("512 bytes");
    expect(fmtBytes(12345)).toBe("12.3 kB");
    expect(fmtBytes(4_600_000)).toBe("4.6 MB");
    expect(fmtBytes(2_500_000_000)).toBe("2.50 GB");
    expect(fmtBytes(null)).toBe("size unknown");
  });
});
