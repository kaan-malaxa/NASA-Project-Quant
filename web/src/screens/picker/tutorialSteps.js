/**
 * "How to use this site": fixed text (no numbers, dates or trend directions). Each step's `section` is an id on the
 * region page (SectionNav), which scrolls there on arrival; `to` overrides the destination.
 * Every feature named here exists on the site (checked against the region page and the downloads panel).
 */
export const TUTORIAL_STEPS = [
  { id: "pick", title: "Pick a place", target: '[data-tour="places"]', text: "Each card opens a region. Its badge describes the recent-data comparison when that data is available." },
  { id: "verdict", title: "The verdict", section: "verdict", target: '[data-tour="verdict-figures"]', text: "Read the summary and compare the raw and harmonized figures. The likely range describes uncertainty, rather than a guaranteed outcome." },
  { id: "calendar", title: "The fire calendar", section: "calendar", target: '[data-tour="view"]', text: "Choose Clock, Weeks or Months to change how the calendar is arranged. Select a calendar cell for its details." },
  { id: "lenses", title: "Lenses", section: "calendar", target: '[data-tour="lens"]', text: "These controls compare records as recorded with the naive splice and the harmonized record. Harmonized means the records have been translated onto one scale." },
  { id: "normal", title: "Compared with normal", section: "calendar", target: '[data-tour="mode"]', text: "The comparison mode ranks each period against the same period in baseline years. A percentile describes its position among those past values." },
  { id: "critical", title: "Critical weeks", section: "critical-weeks", target: '[data-tour="critical-weeks"]', text: "Explore the core of the fire season and the evidence for changes in its timing. Read the likely range alongside any shift estimate." },
  { id: "week", title: "This week", section: "this-week", target: '[data-tour="this-week"]', text: "This section describes recent burning and when the summary was prepared. Check the as-of label; when recent data is unavailable, the section says so." },
  { id: "years", title: "Analysis years", target: '[data-tour="years"]', text: "Choose the analysis years here. This changes the period used by the summaries; the tour leaves your current selection unchanged." },
  { id: "dates", title: "Exact date filters", target: '[data-tour="dates"]', text: "Use the date controls or presets to select an exact interval. The period totals and downloads use your selected range." },
  { id: "downloads", title: "Dates and downloads", section: "downloads", target: '[data-tour="downloads"]', text: "Download series and calendar CSV files here. Chart images are available when a chart has drawn; value labels distinguish observed, harmonized, estimated and missing data." },
  { id: "brief", title: "Season Brief", section: "downloads", target: '[data-tour="brief"]', text: "Open the Season Brief for a printable summary of this region. You can print it or save it as a PDF using your browser." },
  { id: "methods", title: "Methods", target: '[data-tour="methods"]', text: "The Methods page explains the translation, validation and limitations. The separate Simulation test page shows checks against a known answer." },
];

export const TUTORIAL_SEEN_KEY = "pt-tutorial-seen";

/** Open the tutorial by itself? Only on a first visit, never under automation (Playwright sets navigator.webdriver). */
export function shouldAutoOpenTutorial(win = typeof window === "undefined" ? undefined : window) {
  if (!win || win.navigator?.webdriver) return false;
  try {
    return win.localStorage.getItem(TUTORIAL_SEEN_KEY) !== "1";
  } catch {
    return false;
  }
}

export function markTutorialSeen(win = typeof window === "undefined" ? undefined : window) {
  try {
    win?.localStorage.setItem(TUTORIAL_SEEN_KEY, "1");
  } catch {
    /* storage blocked: it may open again next time */
  }
}
