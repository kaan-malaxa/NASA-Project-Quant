import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { ArrowRight } from "lucide-react";
import SectionState from "@/components/SectionState.jsx";
import { VizSlot } from "@/components/Viz.jsx";
import { useRegions } from "@/data/useRegions.js";
import { useJson } from "@/data/useJson.js";
import { regionFilePath } from "@/data/files.js";
import { useDocumentMeta } from "@/lib/useDocumentMeta.js";
import { siteUrl } from "@/lib/siteUrl.js";
import LandingStory from "./landing/LandingStory.jsx";
import LandingLoader from "./landing/LandingLoader.jsx";
import Reveal from "./landing/Reveal.jsx";
import ProblemStage from "./landing/ProblemStage.jsx";
import LiveThisWeek from "./landing/LiveThisWeek.jsx";
import { useLandingReadiness } from "./landing/useLandingReadiness.js";
import { useInertBehind, usePrefetchRegion } from "./landing/afterLoader.js";
import { LOADER, loaderYears, markLandingBootUsed, shouldShowLoader } from "./landing/loaderMath.js";
import "@/styles/landing.css";

const WHY_NOW_CLAIMS = ["snpp_end", "aqua_drift"];

// Problem copy from the product owner (prompt: landing changes, item 5); fixed text with no numbers, dates or directions.
const PROBLEM =
  "Satellites have been watching fires from space for decades, but the cameras changed along the way. A newer, sharper sensor sees smaller fires than the older one, so when the records are joined the number of fires appears to jump. That jump looks like the world started burning more, when much of it is just a better camera. Anyone comparing fires then and now, such as fire planners, researchers or reporters, can be misled.";

// Solution copy: for now the product owner's mission paragraph (to be edited); fixed text, no results in it.
const SOLUTION =
  "NASA has watched fires from space for over two decades, but the cameras changed along the way. FireRosetta puts the old and new satellite records on one scale, so a jump in the record means more fire, not a better camera.";

/** Screen 1 · The broken ruler (contracts section 7, R5 role file section 9), as a scroll story over the globe. */
export default function Landing() {
  useDocumentMeta(
    "",
    "Is it really burning more, or did the satellite get better eyes? Satellite fire records from MODIS and VIIRS, put on one scale.",
  );
  const { state: regionsState, defaultRegion } = useRegions();
  const rulerListed = defaultRegion?.files?.includes("ruler");
  const ruler = useJson(rulerListed ? regionFilePath(defaultRegion.id, "ruler") : null);
  const methods = useJson("methods.json");
  // The years on the problem diagram's axis (first, sensor switch, last), from ruler.json: never typed.
  const rulerYears = useMemo(() => (ruler.status === "ok" ? loaderYears(ruler.data) : null), [ruler]);
  // Each satellite's role in the record (reference, translated, not used) is read from calibration.json, never typed.
  const calibrationListed = defaultRegion?.files?.includes("calibration");
  const calibration = useJson(calibrationListed ? regionFilePath(defaultRegion.id, "calibration") : null);

  // A full page load of the landing page (not in-app navigation; not reduced motion): the loader covers the page
  // while everything underneath loads and draws. The page is mounted now, not after the loader.
  const [showLoader, setShowLoader] = useState(shouldShowLoader);
  const rootRef = useRef(null);
  const tracker = useLandingReadiness(rootRef);
  const [forceStatic, setForceStatic] = useState(false);
  const onTexture = useCallback((ok = true) => tracker.done("texture", ok), [tracker]);
  const onReady = useCallback(() => tracker.done("scene"), [tracker]);
  const onLayout = useCallback(() => tracker.done("layout"), [tracker]);
  useEffect(() => {
    if (!showLoader) return;
    // Never wait forever: at LOADER.maxWait the loader ends anyway and the sections use their fallbacks
    // (the static Earth if the globe is not drawn yet).
    const id = setTimeout(() => {
      if (tracker.allDone()) return;
      if (import.meta.env.DEV)
        console.info("Landing loader: still pending at the 8 s limit:", tracker.pending().join(", "));
      if (!tracker.isDone("scene")) setForceStatic(true);
    }, LOADER.maxWait);
    return () => clearTimeout(id);
  }, [showLoader, tracker]);
  useInertBehind(showLoader);
  usePrefetchRegion(defaultRegion, !showLoader);
  // This page load's landing render has happened: coming back to #/ inside the app does not show the loader again.
  useEffect(() => markLandingBootUsed(), []);
  const hideLoader = useCallback(() => setShowLoader(false), []);

  /** @param {boolean} revealed */
  const renderRuler = (revealed) =>
    regionsState.status !== "ok" ? (
      <SectionState state={regionsState} title="Places" />
    ) : !defaultRegion ? (
      <SectionState state={{ status: "absent" }} title="The broken ruler" />
    ) : (
      <SectionState state={ruler} title="The broken ruler" skeletonClassName="h-64">
        {(data) => (
          <figure className="space-y-3">
            {/* Remounted when first revealed, so its draw-in animation plays where it can be seen. */}
            <VizSlot
              key={revealed ? "shown" : "waiting"}
              name="BrokenRuler"
              ruler={data}
              animate={revealed}
              placeholderClassName="h-64"
            />
            <figcaption className="max-w-3xl text-base text-pretty sm:text-lg">{data.sentence}</figcaption>
            <p className="text-muted-foreground text-sm">Shown for {defaultRegion.name}.</p>
          </figure>
        )}
      </SectionState>
    );

  return (
    <div ref={rootRef}>
      <LandingStory
        calibration={calibration.status === "ok" ? calibration.data : null}
        head={
          <h1
            id="landing-title"
            className="landing-headline text-4xl leading-[1.05] font-extrabold tracking-tight text-balance sm:text-6xl lg:text-7xl"
          >
            Is it really burning more, or did the satellite get better eyes?
          </h1>
        }
        cta={
          <Link to="/pick" className="landing-cta pointer-events-auto">
            Pick a place
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        }
        renderRuler={renderRuler}
        onReady={onReady}
        onTexture={onTexture}
        onLayout={onLayout}
        layoutReady={regionsState.status !== "loading" && (!rulerListed || ruler.status !== "loading")}
        forceStatic={forceStatic}
        hold={showLoader}
      />
      {showLoader ? <LandingLoader tracker={tracker} onDone={hideLoader} /> : null}

      <ProblemStage years={rulerYears} problem={PROBLEM} solution={SOLUTION} />
      <StartHere downloadsRegion={defaultRegion} />
      {regionsState.status === "ok" ? <LiveThisWeek regions={regionsState.data.regions} /> : regionsState.status === "loading" ? (
        <div className="mx-auto w-full max-w-6xl px-4 pb-16"><div className="bg-card rounded-xl border p-5 sm:p-6"><SectionState state={regionsState} title="Live this week" variant="live" /></div></div>
      ) : null}

      <div className="mx-auto w-full max-w-6xl space-y-8 px-4 pb-10">
        {methods.status === "ok" ? <WhyNow sources={methods.data.sources} /> : null}
        <div className="flex flex-wrap items-end justify-end gap-6">
          <PhoneQr />
        </div>
      </div>
    </div>
  );
}

/**
 * "Start here": three ways in, as a numbered vertical path (one thin line, three nodes). Each row is one link.
 * Rows reveal one after another as they scroll in (none with reduced motion).
 */
function StartHere({ downloadsRegion }) {
  const rows = [
    {
      title: "One honest record",
      text: "MODIS and VIIRS counts translated onto one scale, with every method choice written down.",
      more: "Newer satellites see smaller fires than older ones, so a raw record mixes real change with better eyesight. We measure how differently the two sensors see the same fires, then translate both onto one scale. Every choice we made, and every check we ran, is on the methods page.",
      find: [
        "How the two sensors are compared on the same days",
        "How sure we are, shown as a likely range",
        "The tests that could have proved us wrong",
      ],
      to: "/methods",
      link: "Read the methods",
    },
    {
      title: "See your place",
      text: "Pick a region to see when it burns, how that has changed, and how this week compares.",
      more: "Each region has its own page: when its fire season usually peaks, whether the busiest weeks have shifted, and where in the region fires cluster. Pick any date range to see totals for that period, or draw your own area on the map.",
      find: [
        "A calendar of every week and month in the record",
        "The critical weeks that hold most of a year's burning",
        "How this week compares with the same week in past years",
      ],
      to: "/pick",
      link: "Pick a place",
    },
    {
      title: "Open data",
      text: "Every chart comes with its numbers to download, with units and where each value comes from.",
      // Product owner's text, with "Every view can be downloaded" narrowed to what the downloads panel offers.
      more: "Nothing is locked inside a chart. The record behind the charts can be downloaded as spreadsheet files, each value marked as observed, harmonized, estimated or missing, so you always know what is measured and what is calculated. There's also a one-page Season Brief to print or share.",
      find: [
        "Daily and monthly series as CSV files",
        "Chart images to reuse in reports",
        "A printable Season Brief for each region",
      ],
      to: downloadsRegion ? `/r/${downloadsRegion.id}` : "/pick",
      state: downloadsRegion ? { section: "downloads" } : undefined,
      link: downloadsRegion ? `Downloads for ${downloadsRegion.name}` : "Pick a place for its downloads",
    },
  ];
  return (
    <section aria-labelledby="start-title" className="landing-start">
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-16 sm:py-24 md:grid-cols-[1fr_2fr] md:gap-16">
        <div className="start-intro space-y-2">
          <h2 id="start-title" className="text-3xl font-bold tracking-tight sm:text-4xl">
            Start here
          </h2>
          <p className="text-muted-foreground text-lg">Three ways in</p>
          <p className="text-muted-foreground max-w-[34rem] pt-4 text-pretty">
            FireRosetta is built for anyone who needs to know whether fires are really changing: fire
            planners, researchers, reporters and curious readers. You don&apos;t need to know anything about
            satellites to use it. Start with the method if you want to check our work, with a place if you
            want answers for where you live, or with the data if you want to run your own numbers.
          </p>
          <p className="start-source pt-2">Data: NASA FIRMS · MODIS and VIIRS active fire records</p>
        </div>
        <ol className="start-path">
          {rows.map((r, i) => (
            <Reveal as="li" key={r.title} className="start-row" style={{ transitionDelay: `${i * 80}ms` }}>
              <Link to={r.to} state={r.state} className="start-link">
                <span className="start-node" aria-hidden="true" />
                <span className="start-num">{String(i + 1).padStart(2, "0")}</span>
                <span className="start-body">
                  <span className="start-title">{r.title}</span>
                  <span className="start-text">{r.text}</span>
                  <span className="start-more">{r.more}</span>
                  <span className="start-find-label">You&apos;ll find</span>
                  <ul className="start-find">
                    {r.find.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                  <span className="start-cta">
                    {r.link}
                    <ArrowRight aria-hidden="true" className="start-arrow size-4" />
                  </span>
                </span>
              </Link>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}

/** One line built only from methods.json sources; omitted when neither claim is present. */
function WhyNow({ sources }) {
  const claims = WHY_NOW_CLAIMS.map((id) => (sources || []).find((s) => s.claim_id === id)).filter(Boolean);
  if (!claims.length) return null;
  return (
    <p className="max-w-3xl text-sm text-pretty" data-testid="why-now">
      <span className="font-medium">Why now: </span>
      {claims.map((c, i) => (
        <span key={c.claim_id}>
          {i ? " " : ""}
          {c.text}{" "}
          <a href={c.url} target="_blank" rel="noreferrer" className="underline underline-offset-4">
            (source, checked {c.checked})
          </a>
        </span>
      ))}
    </p>
  );
}

function PhoneQr() {
  const url = siteUrl();
  if (!url) return null;
  return (
    <figure className="flex items-center gap-3">
      <div className="bg-background text-foreground rounded-md border p-2">
        <QRCodeSVG
          value={url}
          size={88}
          fgColor="currentColor"
          bgColor="transparent"
          title={`QR code for ${url}`}
        />
      </div>
      <figcaption className="text-sm">Open on your phone</figcaption>
    </figure>
  );
}
