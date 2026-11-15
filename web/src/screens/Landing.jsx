import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { ArrowRight } from "lucide-react";
import SectionState from "@/components/SectionState.jsx";
import { VizSlot } from "@/components/Viz.jsx";
import { useRegions } from "@/data/useRegions.js";
import { useJson } from "@/data/useJson.js";
import { regionFilePath } from "@/data/files.js";
import { useDocumentMeta } from "@/lib/useDocumentMeta.js";
import LandingStory from "./landing/LandingStory.jsx";
import LandingLoader from "./landing/LandingLoader.jsx";
import Reveal from "./landing/Reveal.jsx";
import LiveThisWeek from "./landing/LiveThisWeek.jsx";
import { LOADER, markLoaderSeen, shouldShowLoader } from "./landing/loaderMath.js";
import "@/styles/landing.css";

const WHY_NOW_CLAIMS = ["snpp_end", "aqua_drift"];

// Problem copy from the product owner (prompt: landing changes, item 5); fixed text with no numbers, dates or directions.
const PROBLEM =
  "Satellites have been watching fires from space for decades, but the cameras changed along the way. A newer, sharper sensor sees smaller fires than the older one, so when the records are joined the number of fires appears to jump. That jump looks like the world started burning more, when much of it is just a better camera. Anyone comparing fires then and now, such as fire planners, researchers or reporters, can be misled.";

// Mission copy from the product owner (prompt Phase 2); fixed text, no results in it.
const MISSION =
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
  // Each satellite's role in the record (reference, translated, not used) is read from calibration.json, never typed.
  const calibrationListed = defaultRegion?.files?.includes("calibration");
  const calibration = useJson(calibrationListed ? regionFilePath(defaultRegion.id, "calibration") : null);

  // First visit in this session (and not reduced motion): the dot-sphere loader until the globe is ready.
  const [showLoader, setShowLoader] = useState(shouldShowLoader);
  const [ready, setReady] = useState(false);
  const [forceStatic, setForceStatic] = useState(false);
  const readyRef = useRef(false);
  const onReady = useCallback(() => {
    readyRef.current = true;
    setReady(true);
  }, []);
  useEffect(() => {
    if (!showLoader) return;
    markLoaderSeen();
    // Never wait forever: after LOADER.maxWait the loader finishes and the page shows the static Earth.
    const id = setTimeout(() => {
      if (!readyRef.current) setForceStatic(true);
    }, LOADER.maxWait);
    return () => clearTimeout(id);
  }, [showLoader]);
  const hideLoader = useCallback(() => setShowLoader(false), []);

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
    <div>
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
          </Link>
        }
        renderRuler={renderRuler}
        onReady={onReady}
        forceStatic={forceStatic}
      />
      {showLoader ? <LandingLoader sceneReady={ready || forceStatic} onDone={hideLoader} /> : null}

      <Problem />
      <Mission downloadsRegion={defaultRegion} />
      {regionsState.status === "ok" ? <LiveThisWeek regions={regionsState.data.regions} /> : null}

      <div className="mx-auto w-full max-w-6xl space-y-8 px-4 pb-10">
        {methods.status === "ok" ? <WhyNow sources={methods.data.sources} /> : null}
        <div className="flex flex-wrap items-end justify-end gap-6">
          <PhoneQr />
        </div>
      </div>
    </div>
  );
}

function Problem() {
  return (
    <Reveal aria-labelledby="problem-title" className="landing-problem">
      <div className="mx-auto w-full max-w-6xl px-4 pt-16 sm:pt-24">
        <div className="max-w-3xl space-y-4">
          <h2 id="problem-title" className="text-3xl font-bold tracking-tight sm:text-4xl">
            The problem
          </h2>
          <p className="text-lg text-pretty sm:text-xl">{PROBLEM}</p>
        </div>
      </div>
    </Reveal>
  );
}

function Mission({ downloadsRegion }) {
  const cards = [
    {
      title: "One honest record",
      text: "MODIS and VIIRS counts translated onto one scale, with every method choice written down.",
      to: "/methods",
      link: "Read the methods",
    },
    {
      title: "See your place",
      text: "Pick a region to see when it burns, how that has changed, and how this week compares.",
      to: "/pick",
      link: "Pick a place",
    },
    {
      title: "Open data",
      text: "Every chart comes with its numbers to download, with units and where each value comes from.",
      to: downloadsRegion ? `/r/${downloadsRegion.id}` : "/pick",
      state: downloadsRegion ? { section: "downloads" } : undefined,
      link: downloadsRegion ? `Downloads for ${downloadsRegion.name}` : "Pick a place for its downloads",
    },
  ];
  return (
    <Reveal aria-labelledby="mission-title" className="landing-mission">
      <div className="mx-auto w-full max-w-6xl space-y-10 px-4 py-16 sm:py-24">
        <div className="max-w-3xl space-y-4">
          <h2 id="mission-title" className="text-3xl font-bold tracking-tight sm:text-4xl">
            Our mission
          </h2>
          <p className="text-lg text-pretty sm:text-xl">{MISSION}</p>
        </div>
        <ul className="grid gap-4 sm:grid-cols-3">
          {cards.map((c) => (
            <li key={c.title} className="mission-card bg-card flex flex-col gap-3 rounded-xl border p-5">
              <h3 className="text-lg font-semibold">{c.title}</h3>
              <p className="text-muted-foreground flex-1 text-sm text-pretty">{c.text}</p>
              <Link
                to={c.to}
                state={c.state}
                className="inline-flex items-center gap-1 text-sm font-medium underline underline-offset-4"
              >
                {c.link}
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </Reveal>
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
  const url = typeof window !== "undefined" ? window.location.origin + window.location.pathname : "";
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
