import SectionState from "@/components/SectionState.jsx";
import GlossaryTerm from "@/components/GlossaryTerm.jsx";
import { VizSlot } from "@/components/Viz.jsx";
import StorySection from "./StorySection.jsx";

/** Screen 5 · Critical weeks, from season.json. */
export default function CriticalWeeksSection({ state }) {
  return (
    <StorySection id="critical-weeks" title="Critical weeks">
      <SectionState state={state} title="Critical weeks" skeletonClassName="h-40">
        {(season) => {
          const showShift = season.windows.some((w) => w.by_year?.length);
          return (
            <div className="space-y-4">
              <p className="text-sm">
                <GlossaryTerm term="critical_weeks">Critical weeks</GlossaryTerm>: {season.definition}.
              </p>
              <ul className="max-w-3xl space-y-2">
                {season.windows.map((w) => (
                  <li key={w.id} className="text-lg text-pretty">
                    {w.sentence}
                  </li>
                ))}
              </ul>
              {showShift ? <VizSlot name="SeasonShiftChart" season={season} placeholderClassName="h-56" /> : null}
            </div>
          );
        }}
      </SectionState>
    </StorySection>
  );
}
