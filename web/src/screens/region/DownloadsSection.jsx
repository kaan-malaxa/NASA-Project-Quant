import StorySection from "./StorySection.jsx";

/** Downloads are built in prompt C2; the section exists now so the nav and layout are final. */
export default function DownloadsSection() {
  return (
    <StorySection id="downloads" title="Downloads">
      <p className="text-muted-foreground text-sm">Downloads for this place will appear here.</p>
    </StorySection>
  );
}
