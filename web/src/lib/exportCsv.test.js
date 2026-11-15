import { describe, expect, it } from "vitest";
import Papa from "papaparse";
import { buildCalendarCsv, buildSeriesCsv, commentRow, csvField, exportFileName } from "./exportCsv.js";

const daily = {
  schema_version: "1.0", generated_at: "2026-11-14T00:00:00Z", code_version: "abc1234", region: "testland",
  start: "2010-01-01", n_days: 10,
  series: {
    harmonized: {
      unit: "Aqua-equivalent fire cell-days, per day",
      value: [1, 2, null, 4, 5, 6, 7, 8, 9, 10],
      lo: [0, 1, null, 3, 4, 5, 6, 7, 8, 9],
      hi: [2, 3, null, 5, 6, 7, 8, 9, 10, 11],
    },
  },
  kind_runs: [{ series: "harmonized", from: "2010-01-01", to: "2010-12-31", kind: "observed", source: "aqua" }],
};

const parse = (csv) => Papa.parse(csv.split("\n").slice(1).join("\n"), { header: true, skipEmptyLines: true }).data;

describe("buildSeriesCsv", () => {
  it("has the comment row, the header and one line per day in range", () => {
    const csv = buildSeriesCsv(daily, "harmonized", { from: "2010-01-01", to: "2010-01-10" });
    const lines = csv.trimEnd().split("\n");
    expect(lines[0]).toBe(
      '# Prometheus Torch abc1234 2026-11-14T00:00:00Z region=testland lens=harmonized unit="Aqua-equivalent fire cell-days, per day" source=NASA FIRMS',
    );
    expect(lines[1]).toBe("date,series,value,lo,hi,kind,source,unit");
    expect(lines).toHaveLength(2 + 10);
  });

  it("serialises missing days with empty values and kind missing", () => {
    const rows = parse(buildSeriesCsv(daily, "harmonized", { from: "2010-01-02", to: "2010-01-04" }));
    expect(rows).toHaveLength(3);
    expect(rows[1]).toEqual({ date: "2010-01-03", series: "harmonized", value: "", lo: "", hi: "", kind: "missing", source: "", unit: "Aqua-equivalent fire cell-days, per day" });
    expect(rows[0]).toMatchObject({ date: "2010-01-02", value: "2", lo: "1", hi: "3", kind: "observed", source: "aqua" });
  });

  it("quotes commas in units", () => {
    const line = buildSeriesCsv(daily, "harmonized", { from: "2010-01-01", to: "2010-01-01" }).trimEnd().split("\n")[2];
    expect(line).toBe('2010-01-01,harmonized,1,0,2,observed,aqua,"Aqua-equivalent fire cell-days, per day"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField(null)).toBe("");
  });

  it("clips to the data and falls back to harmonized for lenses not in the file", () => {
    const csv = buildSeriesCsv(daily, "viirs_equiv", { from: "2009-01-01", to: "2030-01-01" });
    expect(csv.split("\n")[0]).toContain("lens=harmonized");
    expect(parse(csv)).toHaveLength(10);
  });
});

describe("buildCalendarCsv", () => {
  const row = (year, slot, grain, value, kind = "observed", series = "harmonized") => ({ year, [grain]: slot, series, value, lo: value, hi: value, kind, source: "aqua" });
  const meta = { harmonized: { label: "H", unit: "Aqua-equivalent fire cell-days per week" } };

  it("has a year column, 52 week value columns and a kinds column", () => {
    const weekly = { ...daily, series_meta: meta, rows: [row(2010, 1, "week", 3), row(2010, 52, "week", null, "missing"), row(2011, 2, "week", 4, "harmonized")] };
    const csv = buildCalendarCsv("week", weekly, "harmonized", { from: "2010-01-01", to: "2011-12-31" });
    const lines = csv.trimEnd().split("\n");
    const header = lines[1].split(",");
    expect(header[0]).toBe("year");
    expect(header.slice(1, -1)).toHaveLength(52);
    expect(header.at(-1)).toBe("kinds");
    const y2010 = lines[2].split(",");
    expect(y2010[0]).toBe("2010");
    expect(y2010[1]).toBe("3");
    expect(y2010[52]).toBe("");
    expect(y2010[53]).toBe("missing;observed");
    expect(lines[3].split(",")[2]).toBe("4");
  });

  it("has 12 month value columns for months", () => {
    const monthly = { ...daily, series_meta: meta, rows: [row(2010, 12, "month", 9)] };
    const lines = buildCalendarCsv("month", monthly, "harmonized", { from: "2010-01-01", to: "2010-12-31" }).trimEnd().split("\n");
    expect(lines[1].split(",")).toHaveLength(1 + 12 + 1);
    expect(lines[2].split(",")[12]).toBe("9");
  });
});

describe("names", () => {
  it("builds file names and the comment row", () => {
    expect(exportFileName({ region: "punjab", lens: "harmonized", from: "2003-01-01", to: "2026-11-13", ext: "csv" })).toBe(
      "prometheus_torch_punjab_harmonized_2003-01-01_2026-11-13.csv",
    );
    expect(exportFileName({ region: "p", lens: "l", from: "a", to: "b", suffix: "weeks", ext: "png" })).toBe("prometheus_torch_p_l_a_b_weeks.png");
    expect(commentRow({ code_version: "sample", generated_at: "t", region: "r", lens: "l", unit: "u" })).toBe(
      "# Prometheus Torch sample t region=r lens=l unit=u source=NASA FIRMS",
    );
  });
});
