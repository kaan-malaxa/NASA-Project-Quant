import SectionState from "@/components/SectionState.jsx";
import StorySection from "./StorySection.jsx";
import NowcastBody, { monthToDateLine } from "./NowcastBody.jsx";

// Kept for existing imports: the month-to-date line now lives in NowcastBody.jsx.
export { monthToDateLine };

/** Screen 6 · This week, from nowcast.json. */
export default function ThisWeekSection({ state }) {
  return (
    <StorySection id="this-week" title="This week">
      <SectionState state={state} title="This week" skeletonClassName="h-40">
        {(n) => <NowcastBody nowcast={n} />}
      </SectionState>
    </StorySection>
  );
}
