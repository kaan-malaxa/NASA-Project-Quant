import { KIND_INFO } from "@/lib/glossary.js";

/**
 * The five satellites behind the two fire records, for the landing globe.
 *
 * Everything here is fixed descriptive copy (R5 role file section 9): names, instruments, how the method treats a
 * satellite. There are no results, no dates of satellite events and no statuses in this file. A satellite's role in
 * the record, with its dates, is read from calibration.json by satelliteRole() below.
 *
 * Orbits are a drawing: all five are near-polar and sun-synchronous. Terra and Aqua fly lower than the three VIIRS
 * satellites; the heights are exaggerated so the difference shows, and each satellite gets its own orbit plane so the
 * lines do not overlap.
 */
export const INCLINATION_DEG = 98;

export const SHELLS = {
  low: { radius: 1.1, speed: 0.2 },
  high: { radius: 1.2, speed: 0.15 },
};

export const INSTRUMENTS = {
  modis: {
    label: "MODIS",
    glossary: "modis",
    pixel: "Pixel size: about 1 km.",
  },
  viirs: {
    label: "VIIRS",
    glossary: "viirs",
    pixel: "Pixel size: 375 m.",
  },
};

export const SATELLITES = [
  {
    id: "terra",
    name: "Terra",
    instrument: "modis",
    shell: "low",
    raan: -62,
    phase: 0.4,
    about:
      "Terra passes over in the morning. Its detections are part of the raw record as people download it. FireRosetta's corrected record is built on the afternoon satellites, so it does not add Terra's counts to them.",
  },
  {
    id: "aqua",
    name: "Aqua",
    instrument: "modis",
    shell: "low",
    raan: 12,
    phase: 2.6,
    about:
      "Aqua passes over in the afternoon, when fires are most active. Its long record is the ruler: FireRosetta expresses every other satellite's counts as what Aqua would have recorded.",
  },
  {
    id: "snpp",
    name: "Suomi NPP",
    instrument: "viirs",
    shell: "high",
    raan: -28,
    phase: 4.4,
    about:
      "Suomi NPP carries the first VIIRS instrument. It sees smaller fires than MODIS, so its raw counts are higher. FireRosetta translates them onto the Aqua scale so the two records can be compared.",
  },
  {
    id: "noaa20",
    name: "NOAA-20",
    instrument: "viirs",
    shell: "high",
    raan: 48,
    phase: 1.5,
    about:
      "NOAA-20 carries the same kind of VIIRS instrument as Suomi NPP. FireRosetta translates its counts onto the Aqua scale too.",
  },
  {
    id: "noaa21",
    name: "NOAA-21",
    instrument: "viirs",
    shell: "high",
    raan: 86,
    phase: 5.6,
    about:
      "NOAA-21 carries the newest VIIRS instrument. A satellite's counts join the FireRosetta record only after a calibration has been fitted for that satellite.",
  },
];

/** Scene radius kept inside the view at full size: the outer orbit plus room for the models. */
export const FIT_RADIUS = SHELLS.high.radius + 0.22;

/** The outer orbit's diameter as a share of the smaller screen side, when the globe is full size. */
export const ORBIT_FRACTION = SHELLS.high.radius / FIT_RADIUS;

export function satelliteById(id) {
  return SATELLITES.find((s) => s.id === id) ?? null;
}

const ROLE_TITLES = {
  observed: "Reference sensor",
  harmonized: "Translated to the reference scale",
  estimated: "Estimated",
};

/**
 * A satellite's role in the harmonized record, read from calibration.json `eras` (never typed by hand).
 * @param {string} id satellite code as used in the data files (aqua, snpp, noaa20, ...)
 * @param {{ eras?: {source: string, kind: string, from: string, to: string | null}[] } | null | undefined} calibration
 * @returns {{ inRecord: boolean, title: string, lines: string[] } | null} null when the file is not available
 */
export function satelliteRole(id, calibration) {
  const all = calibration?.eras;
  if (!Array.isArray(all) || !all.length) return null;
  const eras = all.filter((e) => e.source === id);
  if (!eras.length) {
    return {
      inRecord: false,
      title: "Not in the harmonized record",
      lines: ["This version of the record does not use this satellite's counts."],
    };
  }
  const kinds = [...new Set(eras.map((e) => e.kind))];
  return {
    inRecord: true,
    title: kinds.map((k) => ROLE_TITLES[k] ?? KIND_INFO[k]?.label ?? k).join(" / "),
    lines: eras.map((e) => {
      const what = KIND_INFO[e.kind]?.text ?? "";
      const when = e.to ? `Used from ${e.from} to ${e.to}.` : `Used from ${e.from} onward.`;
      return `${what} ${when}`.trim();
    }),
  };
}
