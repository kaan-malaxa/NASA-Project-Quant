import StorySection from "./StorySection.jsx";

/** "In this period" analytics followed by the downloads panel (screen spec groups the two). */
export default function DownloadsSection({ children }) {
  return (
    <StorySection id="downloads" title="In this period and downloads">
      {children}
    </StorySection>
  );
}
