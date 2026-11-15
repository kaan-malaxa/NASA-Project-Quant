import StorySection from "./StorySection.jsx";

/** "In this period" analytics plus the downloads (prompt C2 adds the download buttons). */
export default function DownloadsSection({ children }) {
  return (
    <StorySection id="downloads" title="In this period and downloads">
      {children}
      <div className="space-y-1">
        <h3 className="text-lg font-semibold">Downloads</h3>
        <p className="text-muted-foreground text-sm">Downloads for this place will appear here.</p>
      </div>
    </StorySection>
  );
}
