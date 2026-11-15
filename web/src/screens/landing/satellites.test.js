import { describe, expect, it } from "vitest";
import { INSTRUMENTS, SATELLITES, SHELLS, satelliteById, satelliteRole } from "./satellites.js";
import { GLOSSARY } from "@/lib/glossary.js";

const calibration = {
  eras: [
    { from: "2003-01-01", to: "2022-12-31", kind: "observed", source: "aqua" },
    { from: "2023-01-01", to: "2025-12-31", kind: "harmonized", source: "snpp" },
    { from: "2026-01-01", to: null, kind: "harmonized", source: "noaa20" },
  ],
};

describe("SATELLITES", () => {
  it("lists the five satellites with a known instrument and glossary entry", () => {
    expect(SATELLITES.map((s) => s.name)).toEqual(["Terra", "Aqua", "Suomi NPP", "NOAA-20", "NOAA-21"]);
    for (const s of SATELLITES) expect(GLOSSARY[INSTRUMENTS[s.instrument].glossary]).toBeTruthy();
    expect(satelliteById("snpp").instrument).toBe("viirs");
    expect(satelliteById("nope")).toBeNull();
  });

  it("draws MODIS satellites lower than VIIRS satellites, each in its own orbit plane", () => {
    expect(SHELLS.low.radius).toBeLessThan(SHELLS.high.radius);
    expect(SHELLS.low.radius).toBeGreaterThan(1);
    for (const s of SATELLITES) expect(s.shell).toBe(s.instrument === "modis" ? "low" : "high");
    expect(new Set(SATELLITES.map((s) => s.raan)).size).toBe(SATELLITES.length);
  });

  it("keeps dates and result numbers out of the hand-written copy", () => {
    for (const s of SATELLITES) expect(s.about.replaceAll(/NOAA-2[01]/g, "")).not.toMatch(/\d/);
  });
});

describe("satelliteRole", () => {
  it("reads the reference sensor and its dates from the eras", () => {
    const r = satelliteRole("aqua", calibration);
    expect(r).toMatchObject({ inRecord: true, title: "Reference sensor" });
    expect(r.lines[0]).toContain("2003-01-01 to 2022-12-31");
  });

  it("describes a translated satellite, with an open-ended era", () => {
    expect(satelliteRole("snpp", calibration).title).toBe("Translated to the reference scale");
    expect(satelliteRole("noaa20", calibration).lines[0]).toContain("Used from 2026-01-01 onward.");
  });

  it("says a satellite without an era is not in the record", () => {
    expect(satelliteRole("terra", calibration)).toMatchObject({
      inRecord: false,
      title: "Not in the harmonized record",
    });
    expect(satelliteRole("noaa21", calibration).inRecord).toBe(false);
  });

  it("returns null when calibration.json is not available, so nothing is claimed", () => {
    expect(satelliteRole("aqua", null)).toBeNull();
    expect(satelliteRole("aqua", { eras: [] })).toBeNull();
  });
});
