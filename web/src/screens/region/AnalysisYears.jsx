/** Scientific years are deliberately separate from the exact-date download controls. */
export default function AnalysisYears({ analysis, setUrl }) {
  if (!analysis.index) return null;
  return <fieldset className="flex flex-wrap items-center gap-3 rounded-md border p-3">
    <legend className="px-1 font-medium">Analysis years</legend>
    <label>First year <select aria-label="First analysis year" value={analysis.from}
      onChange={(event) => setUrl({analysis_from: event.target.value, analysis_to: String(Math.max(Number(event.target.value), analysis.to))})}>
      {analysis.index.available_years.map((year) => <option key={year}>{year}</option>)}
    </select></label>
    <label>Last year <select aria-label="Last analysis year" value={analysis.to}
      onChange={(event) => setUrl({analysis_to: event.target.value, analysis_from: String(Math.min(Number(event.target.value), analysis.from))})}>
      {analysis.index.available_years.map((year) => <option key={year}>{year}</option>)}
    </select></label>
    <p className="text-muted-foreground text-sm">Complete calendar years for the scientific results. Exact dates below select daily totals and downloads.</p>
    {analysis.state?.status === "loading" ? <span role="status">Loading selected analysis…</span> : null}
  </fieldset>;
}
