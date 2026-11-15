import { describe, expect, it } from "vitest";
import { parseCsv } from "./csv.js";

describe("parseCsv", () => {
  it("parses cells_monthly and keeps ids and ym as text", () => {
    const r = parseCsv("h3_r5,ym,aqua,viirs\n85283473fffffff,201511,3,7\n", "cells_monthly");
    expect(r.ok).toBe(true);
    expect(r.data).toEqual([{ h3_r5: "85283473fffffff", ym: "201511", aqua: 3, viirs: 7 }]);
  });

  it("rejects a wrong header", () => {
    expect(parseCsv("h3,ym,aqua,viirs\nx,201511,1,2\n", "cells_monthly")).toMatchObject({ ok: false, reason: "invalid" });
  });
});
