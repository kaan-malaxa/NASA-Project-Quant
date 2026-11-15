import { VizSlot } from "@/components/Viz.jsx";
import { useDocumentMeta } from "@/lib/useDocumentMeta.js";

/** #/gallery: R6's development page (contracts section 8). Not linked from the nav. */
export default function GalleryScreen() {
  useDocumentMeta("Component gallery");
  return (
    <section aria-labelledby="gallery-title" className="space-y-4">
      <h1 id="gallery-title" className="text-2xl font-semibold">
        Component gallery
      </h1>
      <VizSlot name="Gallery" placeholderClassName="h-64" />
    </section>
  );
}
