import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import SectionState from "@/components/SectionState.jsx";
import { useRegionData } from "@/data/useRegionData.js";
import { useUrlState } from "@/data/useUrlState.js";
import SectionNav from "./region/SectionNav.jsx";
import VerdictSection from "./region/VerdictSection.jsx";
import CalendarSection from "./region/CalendarSection.jsx";
import CriticalWeeksSection from "./region/CriticalWeeksSection.jsx";
import ThisWeekSection from "./region/ThisWeekSection.jsx";
import WhereSection from "./region/WhereSection.jsx";
import DownloadsSection from "./region/DownloadsSection.jsx";
import DateRangeBar from "./region/DateRangeBar.jsx";
import InThisPeriod from "./region/InThisPeriod.jsx";
import StickyBar from "./region/StickyBar.jsx";
import DownloadsPanel from "./region/DownloadsPanel.jsx";
import { useDocumentMeta } from "@/lib/useDocumentMeta.js";

/** #/r/:region — the region story (screens 3–7). */
export default function Region() {
  const { region: id } = useParams();
  const { status, region, files, regionsState } = useRegionData(id);
  const lastDataDay = region?.last_data_day ?? null;
  useDocumentMeta(
    region?.name ?? "Region",
    region
      ? `${region.fire_type} in ${region.name}: the fire calendar, the long-term trend with the sensor change corrected, and this week's burning.`
      : undefined,
  );
  const [url, setUrl] = useUrlState(lastDataDay);
  const [chartEl, setChartEl] = useState(null);
  const meta = files.weekly?.status === "ok" ? files.weekly.data.series_meta : {};
  const lensLabel = (id) => meta?.[id]?.label ?? id;
  useJumpToSection(status === "ok");

  if (status !== "ok") {
    return (
      <section aria-labelledby="region-title" className="space-y-4">
        <h1 id="region-title" className="text-2xl font-semibold">
          Region
        </h1>
        {status === "unknown_region" ? (
          <p>
            There is no place called “{id}” here.{" "}
            <Link to="/pick" className="underline underline-offset-4">
              Pick a place
            </Link>
            .
          </p>
        ) : (
          <SectionState state={regionsState} title="Places" />
        )}
      </section>
    );
  }

  return (
    <article aria-labelledby="region-title" className="space-y-6">
      <header className="space-y-2">
        <p className="text-muted-foreground text-sm">
          <Link to="/pick" className="underline underline-offset-4">
            All places
          </Link>
        </p>
        <h1 id="region-title" className="text-3xl font-semibold tracking-tight">
          {region.name}
        </h1>
        <p className="text-muted-foreground">{region.fire_type}</p>
        <p className="max-w-3xl text-pretty">{region.story}</p>
        <p className="text-muted-foreground text-sm">Data through {region.last_data_day}.</p>
      </header>
      <StickyBar>
        <DateRangeBar url={url} setUrl={setUrl} lastDataDay={lastDataDay} />
        <SectionNav />
      </StickyBar>
      <VerdictSection state={files.trend} />
      <CalendarSection
        files={files}
        url={url}
        setUrl={setUrl}
        lastDataDay={lastDataDay}
        chartRef={setChartEl}
      />
      <CriticalWeeksSection state={files.season} />
      <ThisWeekSection state={files.nowcast} />
      <WhereSection region={region} files={files} url={url} setUrl={setUrl} />
      <DownloadsSection>
        <InThisPeriod
          daily={files.daily}
          nowcast={files.nowcast}
          url={url}
          lastDataDay={lastDataDay}
          lensLabel={lensLabel}
        />
        <DownloadsPanel region={region} files={files} url={url} lastDataDay={lastDataDay} chartEl={chartEl} />
      </DownloadsSection>
    </article>
  );
}

/**
 * Links can ask for a section on arrival (e.g. the landing page's "Open data" card: state { section: "downloads" }).
 * Sections above it grow as their data load, so the jump is repeated a few times, and stops when the visitor scrolls.
 */
function useJumpToSection(ready) {
  const target = useLocation().state?.section;
  useEffect(() => {
    if (!ready || !target) return;
    let stopped = false;
    const stop = () => (stopped = true);
    const jump = () => !stopped && document.getElementById(target)?.scrollIntoView({ block: "start" });
    const timers = [0, 400, 1200, 2500].map((ms) => setTimeout(jump, ms));
    window.addEventListener("wheel", stop, { passive: true, once: true });
    window.addEventListener("touchstart", stop, { passive: true, once: true });
    window.addEventListener("keydown", stop, { once: true });
    return () => {
      timers.forEach(clearTimeout);
      window.removeEventListener("wheel", stop);
      window.removeEventListener("touchstart", stop);
      window.removeEventListener("keydown", stop);
    };
  }, [ready, target]);
}
