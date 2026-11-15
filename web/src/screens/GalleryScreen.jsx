import { VizSlot, hasViz, useViz } from "@/components/Viz.jsx";
import { useDocumentMeta } from "@/lib/useDocumentMeta.js";

/** #/gallery: R6's development page (contracts section 8). Not linked from the nav. */
export default function GalleryScreen() {
  useDocumentMeta("Component gallery");
  // R6's Gallery brings its own "Component gallery" heading. This screen supplies one only while the
  // chart module is loading or absent, so the page always has exactly one level-1 heading.
  const ownHeading = !hasViz("Gallery", useViz());
  return (
    <section aria-label="Component gallery" className="space-y-4">
      {ownHeading && <h1 className="text-2xl font-semibold">Component gallery</h1>}
      <VizSlot name="Gallery" placeholderClassName="h-64" />
    </section>
  );
}
