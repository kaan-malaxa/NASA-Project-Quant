import { Link, useParams } from "react-router-dom";
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

/** #/r/:region — the region story (screens 3–7). */
export default function Region() {
  const { region: id } = useParams();
  const { status, region, files, regionsState } = useRegionData(id);
  const lastDataDay = region?.last_data_day ?? null;
  const [url, setUrl] = useUrlState(lastDataDay);
  const meta = files.weekly?.status === "ok" ? files.weekly.data.series_meta : {};
  const lensLabel = (id) => meta?.[id]?.label ?? id;

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
    <article aria-labelledby="region-title" className="space-y-8">
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
      <CalendarSection files={files} url={url} setUrl={setUrl} lastDataDay={lastDataDay} />
      <CriticalWeeksSection state={files.season} />
      <ThisWeekSection state={files.nowcast} />
      <WhereSection region={region} files={files} url={url} setUrl={setUrl} />
      <DownloadsSection>
        <InThisPeriod daily={files.daily} nowcast={files.nowcast} url={url} lastDataDay={lastDataDay} lensLabel={lensLabel} />
      </DownloadsSection>
    </article>
  );
}
