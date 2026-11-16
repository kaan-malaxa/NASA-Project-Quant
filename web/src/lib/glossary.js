/**
 * Hover definitions. Text copied from plan/roles/R5_web_app.md section 10 (fixed copy, no results).
 * Keys are stable ids used by <GlossaryTerm term="...">.
 */
export const GLOSSARY = {
  hotspot: {
    term: "Hotspot",
    text: "A satellite pixel much hotter than its surroundings when the satellite passed. Usually a fire; sometimes a factory, flare or volcano. Not the same as one fire.",
  },
  modis: {
    term: "MODIS",
    text: "NASA instrument on the Terra (morning) and Aqua (afternoon) satellites. Sees about 1 km squares. Fire data since 2000.",
  },
  viirs: {
    term: "VIIRS",
    text: "Newer instrument on Suomi NPP, NOAA-20 and NOAA-21. Sees 375 m squares, so it catches smaller fires. Fire data since 2012.",
  },
  firms: {
    term: "FIRMS",
    text: "NASA's Fire Information for Resource Management System, which distributes both fire records.",
  },
  fire_cell_day: {
    term: "Fire cell-day",
    text: "One map hexagon (about 36 km²) on one day in which a satellite saw at least one hotspot. Our unit of burning activity.",
  },
  aqua_equivalent: {
    term: "Aqua-equivalent",
    text: "A value expressed as what MODIS Aqua's afternoon pass would have recorded.",
  },
  viirs_equivalent: {
    term: "VIIRS-equivalent",
    text: "A value expressed as what VIIRS would have recorded. Before 2012 this is an estimate.",
  },
  harmonized: {
    term: "Harmonized",
    text: "Two satellite records put on one scale so they can be compared.",
  },
  kinds: {
    term: "Observed / Harmonized / Estimated / No data",
    text: "Recorded directly by the reference satellite / translated from another satellite / modelled for a time before that satellite existed / the satellite was not working.",
  },
  percentile: {
    term: "Percentile",
    text: "Where this period ranks among the same period in past years. 90th means busier than 90 % of them.",
  },
  critical_weeks: {
    term: "Critical weeks",
    text: "The fewest weeks that together hold 80 % of a typical year's burning.",
  },
  frp: {
    term: "FRP",
    text: "Fire radiative power: heat a fire gives off per second, in megawatts. A rough measure of strength.",
  },
  eyesight_curve: {
    term: "Eyesight curve",
    text: "The chance that MODIS Aqua detects burning that VIIRS saw, depending on how strong the fire is.",
  },
  naive_splice: {
    term: "Naive splice",
    text: "What you get by switching from MODIS to VIIRS in 2012 without correcting anything.",
  },
  artifact_share: {
    term: "Artifact share",
    text: "How much of the raw record's change disappears once the sensor change is corrected: (raw change − corrected change) ÷ raw change.",
  },
  range: {
    term: "Range (likely range)",
    text: "The interval our calculation gives 9 times out of 10 when the data are resampled.",
  },
  nrt: {
    term: "NRT",
    text: "Near-real-time data: available within hours, before final quality processing.",
  },
};

/** Plain labels and hover text for each `kind` (split from the "kinds" glossary row). */
export const KIND_INFO = {
  observed: { label: "Observed", text: "Recorded directly by the reference satellite." },
  harmonized: { label: "Harmonized", text: "Translated from another satellite." },
  estimated: { label: "Estimated", text: "Modelled for a time before that satellite existed." },
  missing: { label: "No data", text: "The satellite was not working." },
  sample: { label: "Sample", text: "Placeholder data, not a result." },
};

export function glossaryText(key) {
  return GLOSSARY[key]?.text;
}
