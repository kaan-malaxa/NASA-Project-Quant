import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import "@/styles/loading.css";

/** Decorative text, with varied line lengths rather than a solid rectangle. */
export function SkeletonLines({ count = 3 }) {
    return (
        <div className="sk-lines">
            {Array.from({ length: count }, (_, i) => (
                <Skeleton key={i} className={`sk-line sk-line-${i % 3}`} />
            ))}
        </div>
    );
}
const CalendarControls = () => (
    <div className="sk-stack">
        <div className="flex flex-wrap gap-x-6 gap-y-3">
            <div className="space-y-2">
                <Skeleton className="h-3 w-12" />
                <div className="flex gap-1">
                    {[0, 1, 2].map((i) => (
                        <Skeleton key={i} className="h-9 w-20" />
                    ))}
                </div>
            </div>
            <div className="space-y-2">
                <Skeleton className="h-3 w-12" />
                <div className="flex gap-1">
                    <Skeleton className="h-9 w-24" />
                    <Skeleton className="h-9 w-44" />
                </div>
            </div>
        </div>
        <Skeleton className="h-3 w-24" />
        <div className="sk-buttons">
            {[180, 150, 240, 140, 190, 110].map((width, i) => (
                <Skeleton key={i} className="h-9 max-w-full" style={{ width }} />
            ))}
        </div>
    </div>
);
const Buttons = () => (
    <div className="sk-buttons">
        {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-9 w-28" />
        ))}
    </div>
);
const Figures = () => (
    <div className="sk-figures">
        {[0, 1].map((i) => (
            <div key={i} className="rounded-lg border p-4">
                <SkeletonLines count={3} />
                <Skeleton className="mt-3 h-5 w-24" />
            </div>
        ))}
    </div>
);
const Table = ({ rows = 4 }) => (
    <div className="sk-table">
        {Array.from({ length: rows }, (_, i) => (
            <div key={i} className="sk-table-row">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
            </div>
        ))}
    </div>
);

/** A card uses the same thumbnail size, gaps and border as its eventual picker card. */
function Card() {
    return (
        <div className="sk-card">
            <div className="flex justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-2">
                    <Skeleton className="h-6 w-4/5" />
                    <Skeleton className="h-4 w-3/4" />
                </div>
                <Skeleton className="h-[72px] w-24 shrink-0" />
            </div>
            <SkeletonLines count={2} />
            <Skeleton className="h-5 w-36" />
        </div>
    );
}
export function LoadingShapes({ variant = "text", className = "" }) {
    if (variant === "heading") return <Skeleton className="h-7 w-2/3" />;
    if (variant === "header")
        return (
            <div className="sk-region-header">
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-9 w-3/5" />
                <Skeleton className="h-6 w-2/3" />
                <Skeleton className="sk-story w-4/5" />
                <Skeleton className="h-5 w-44" />
            </div>
        );
    if (variant === "calendar-body")
        return (
            <div className="sk-stack sk-calendar">
                <Skeleton className="sk-clock" />
                <Skeleton className="sk-calendar-legend w-full" />
                <SkeletonLines count={2} />
            </div>
        );
    if (variant === "latest")
        return (
            <div className="sk-stack">
                <Figures />
                <Skeleton className="h-16 w-full" />
                <SkeletonLines count={1} />
            </div>
        );
    if (variant === "brief-verdict")
        return (
            <div className="sk-stack">
                <SkeletonLines count={2} />
                <Figures />
            </div>
        );
    if (variant === "button") return <Skeleton className="h-8 w-28" />;
    if (variant === "cards")
        return (
            <div className="sk-cards">
                {[0, 1, 2].map((i) => (
                    <Card key={i} />
                ))}
            </div>
        );
    if (variant === "verdict")
        return (
            <div className="sk-stack sk-verdict">
                <SkeletonLines count={2} />
                <Skeleton className="sk-trend" />
                <Figures />
                <Table rows={2} />
            </div>
        );
    if (variant === "calendar")
        return (
            <div className="sk-stack sk-calendar">
                <CalendarControls />
                <Skeleton className="sk-clock" />
                <Skeleton className="sk-calendar-legend w-full" />
                <SkeletonLines count={2} />
            </div>
        );
    if (variant === "controls")
        return (
            <div className="sk-stack sk-controls">
                <Skeleton className="sk-analysis w-full" />
                <Skeleton className="sk-dates w-full" />
                <Buttons />
            </div>
        );
    if (variant === "map") return <div className="map-content">
      <div className="flex gap-2"><Skeleton className="h-9 w-36" /><Skeleton className="h-9 w-24" /></div>
      <div className="map-slot"><Skeleton className="sk-map w-full" /><div className="mt-2"><Buttons /></div></div>
      <div className="map-notes"><SkeletonLines count={3} /></div>
    </div>;
    if (variant === "week" || variant === "live")
        return (
            <div className="sk-stack">
                <Skeleton className="h-6 w-36" />
                <SkeletonLines count={2} />
                <Skeleton className="h-24 w-full" />
                <SkeletonLines count={3} />
            </div>
        );
    if (variant === "stats")
        return (
            <div className="sk-stack sk-stats">
                <SkeletonLines count={2} />
                <Table />
                <Table />
                <Figures />
            </div>
        );
    if (variant === "table") return <Table />;
    if (variant === "buttons") return <Buttons />;
    if (variant === "downloads")
        return (
            <div className="sk-stack sk-downloads">
                <SkeletonLines count={2} />
                <div className="sk-figures">
                    {[0, 1, 2, 3, 4].map((i) => (
                        <div className="rounded-lg border p-4 space-y-3" key={i}>
                            <Skeleton className="h-5 w-3/4" />
                            <SkeletonLines count={2} />
                            <Buttons />
                        </div>
                    ))}
                </div>
            </div>
        );
    if (variant === "critical")
        return (
            <div className="sk-stack sk-critical">
                <SkeletonLines count={5} />
                <Skeleton className="sk-season w-full" />
            </div>
        );
    if (variant === "area")
        return (
            <div className="sk-stack">
                <SkeletonLines count={2} />
                <Skeleton className="h-64 w-full" />
                <Table />
            </div>
        );
    if (variant === "methods")
        return (
            <div className="sk-stack">
                {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                    <div key={i} className="sk-section">
                        <Skeleton className="h-6 w-2/3" />
                        <SkeletonLines />
                        <Table />
                    </div>
                ))}
            </div>
        );
    if (variant === "brief")
        return (
            <div className="sk-stack">
                <SkeletonLines count={3} />
                <Figures />
                <Skeleton className="h-48 w-full" />
                <div className="sk-figures">
                    <SkeletonLines count={5} />
                    <Skeleton className="h-56 w-full" />
                </div>
                <SkeletonLines count={2} />
            </div>
        );
    if (variant === "chart") return <Skeleton className={`w-full ${className || "h-64"}`} />;
    return <SkeletonLines />;
}

/** Reserves its shape immediately, but paints only after 150 ms; cached loads never flash. */
export default function LoadingFrame({
    title = "content",
    variant = "text",
    className = "",
    children = undefined,
    style = undefined,
    active = true,
}) {
    const [visible, setVisible] = useState(false);
    const [stalled, setStalled] = useState(false);
    useEffect(() => {
        const timer = setTimeout(() => setVisible(true), 150);
        const deadline = active ? setTimeout(() => setStalled(true), 45000) : null;
        return () => {
            clearTimeout(timer);
            if (deadline) clearTimeout(deadline);
        };
    }, [active]);
    if (stalled)
        return (
            <div data-state="network" role="alert" className="rounded-lg border border-dashed p-4 text-sm">
                <p>{title}: loading is taking longer than expected.</p>
                <button
                    type="button"
                    className="mt-2 underline underline-offset-4"
                    onClick={() => window.location.reload()}
                >
                    Reload this page to try again
                </button>
            </div>
        );
    return (
        <div
            data-state={active ? "loading" : "lazy"}
            aria-busy={active ? "true" : undefined}
            role={active ? "status" : undefined}
            aria-label={active ? `Loading ${title}` : undefined}
            className={`loading-frame ${className}`}
            style={style}
        >
            <span className="sr-only">{active ? "Loading" : "Scroll to load"} {title}</span>
            <div aria-hidden="true" className="loading-shapes" data-visible={visible ? "true" : "false"}>
                {children ?? <LoadingShapes variant={variant} className={className} />}
            </div>
        </div>
    );
}

/** Route fallback and the first JSON request share the same page outline. */
export function PageLoading({ kind = "region", heading = "page", includeHeader = true }) {
    return (
        <div className={`sk-page sk-page-${kind}`}>
            {includeHeader ? (
                <header className="space-y-3">
                    <h1 className="sr-only">Loading {heading}</h1>
                    <LoadingFrame title={`${heading} header`} variant="header" />
                </header>
            ) : null}
            {kind === "pick" ? (
                <>
                    <LoadingFrame title="place search" variant="buttons" />
                    <LoadingFrame title="Places" variant="cards" />
                </>
            ) : kind === "methods" ? (
                <LoadingFrame title="Methods sections" variant="methods" />
            ) : kind === "brief" ? (
                <LoadingFrame title="Season Brief" variant="brief" />
            ) : (
                <>
                    <LoadingFrame title="date controls" variant="controls" />
                    {["verdict", "calendar", "critical", "week", "map"].map((variant) => (
                        <div data-placeholder-section={variant} className="sk-section" key={variant}>
                            <LoadingFrame title={`${variant} heading`} variant="heading" />
                            <LoadingFrame title={variant} variant={variant} />
                        </div>
                    ))}
                    <div data-placeholder-section="downloads" className="sk-section">
                        <LoadingFrame title="Downloads heading" variant="heading" />
                        <LoadingFrame title="In this period" variant="stats" />
                        <LoadingFrame title="Downloads" variant="downloads" />
                    </div>
                </>
            )}
        </div>
    );
}
