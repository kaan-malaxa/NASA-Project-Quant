/** One section of the region story; scroll-margin keeps its heading clear of the sticky bars. */
export default function StorySection({ id, title, intro = undefined, children }) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="bg-card scroll-mt-[calc(var(--sticky-offset,0px)+var(--region-bar-h,6rem)+0.5rem)] space-y-4 rounded-xl border p-5 shadow-sm sm:p-6"
    >
      <div className="space-y-1">
        <h2 id={`${id}-title`} className="text-xl font-semibold tracking-tight">
          {title}
        </h2>
        {intro ? <p className="text-muted-foreground max-w-3xl text-sm">{intro}</p> : null}
      </div>
      {children}
    </section>
  );
}

/** The first file state that is not ok (an unknown state counts as loading), or null when all are ok. */
export function firstNotOk(...states) {
  for (const s of states) {
    if (!s) return { status: "loading" };
    if (s.status !== "ok") return s;
  }
  return null;
}
