import { Component, Suspense, forwardRef, lazy, useCallback, useEffect, useRef, useState } from "react";
import { INSTRUMENTS, SATELLITES, satelliteById, satelliteRole } from "./satellites.js";
import { EARTH_TEXTURE_URL } from "./earthTexture.js";
import { useOnScreen, usePrefersReducedMotion, webglAvailable } from "./motion.js";
import SatellitePanel from "./SatellitePanel.jsx";

// three.js, react-three-fiber and the scene load as one lazy chunk, only when WebGL is available.
const GlobeScene = lazy(() => import("./GlobeScene.jsx"));

const SCENE_LABEL = `The Earth seen from space, turning slowly, with five satellites circling it on near-polar orbits: ${SATELLITES.map((s) => s.name).join(", ")}. Terra and Aqua fly lower than the other three.`;

/**
 * A flat picture of the Earth: shown while the 3D scene loads, and instead of it when WebGL is not available.
 * Placed by CSS variables at the same spot and size as the 3D Earth (see landing.css).
 */
function StaticEarth() {
  return (
    <div
      data-testid="static-earth"
      className="static-earth"
      style={{ backgroundImage: `url("${EARTH_TEXTURE_URL}")` }}
    />
  );
}

/** If the 3D scene fails (no WebGL context, a lost chunk), fall back to the picture instead of crashing the page. */
class SceneBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onFail?.();
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * The landing hero: the globe (3D, or the static picture), the satellite buttons, and the info panel.
 * `children` is the text laid over the scene: in "stacked" mode a column (headline and call to action); in "story"
 * mode the caller positions it (see LandingStory). The scene ignores pointer events that land on text.
 * @param {object} props
 * @param {object | null} props.calibration calibration.json of the default region, or null; the source of each role
 * @param {() => void} [props.onReady] called when the scene is drawn, or when it falls back to the picture
 * @param {object} [props.story] ref read by the 3D scene each frame: { t, globe } (scroll-story position)
 * @param {"stacked" | "story"} [props.mode]
 * @param {object} [props.chipsRef] ref to the satellite button row (measured by the story layout)
 * @param {boolean} [props.forceStatic] show the static picture instead of the 3D scene (e.g. the scene took too long)
 */
const GlobeHero = forwardRef(function GlobeHero(
  { calibration, onReady, story, mode = "stacked", chipsRef, forceStatic = false, children },
  ref,
) {
  const [webglOk] = useState(webglAvailable);
  const webgl = webglOk && !forceStatic;
  // Without the 3D scene there is nothing to wait for.
  useEffect(() => {
    if (!webgl) onReady?.();
  }, [webgl, onReady]);
  const reduced = usePrefersReducedMotion();
  const stageRef = useRef(null);
  const running = useOnScreen(stageRef);
  const [hovered, setHovered] = useState(null);
  const [selected, setSelected] = useState(null);
  const [side, setSide] = useState("right");

  const select = useCallback((id, event) => {
    // The panel opens on the satellite's side of the screen; buttons (no pointer position) open it on the right.
    const rect = stageRef.current?.getBoundingClientRect();
    const x = event?.clientX;
    setSide(rect && typeof x === "number" && x < rect.left + rect.width / 2 ? "left" : "right");
    setSelected(id);
  }, []);

  const close = useCallback(
    (how) => {
      // Give focus back to the satellite's button, except after a press elsewhere (that press decides the focus).
      if (how !== "outside" && selected)
        document.querySelector(`[data-satellite="${selected}"]`)?.focus({ preventScroll: true });
      setSelected(null);
    },
    [selected],
  );

  const sat = selected ? satelliteById(selected) : null;
  const still = <StaticEarth />;

  return (
    <div ref={ref} data-mode={mode} className="landing-hero relative isolate overflow-hidden">
      {/* Soft warm light behind the globe; follows it on the scroll move (CSS variables from LandingStory). */}
      <div aria-hidden="true" className="hero-warm-glow" />
      <div
        ref={stageRef}
        role="img"
        aria-label={SCENE_LABEL}
        data-testid="globe-stage"
        className="absolute inset-0"
      >
        {webgl ? (
          <SceneBoundary fallback={still} onFail={onReady}>
            <Suspense fallback={still}>
              <GlobeScene
                running={running}
                moving={!reduced}
                hovered={hovered}
                selected={selected}
                onHover={setHovered}
                onSelect={select}
                onReady={onReady}
                story={story}
              />
            </Suspense>
          </SceneBoundary>
        ) : (
          still
        )}
      </div>

      <div className="landing-hero-content pointer-events-none relative z-10">
        {children}
        <nav ref={chipsRef} aria-label="Satellites" className="satellite-chips pointer-events-auto">
          <ul className="flex flex-wrap gap-1.5 sm:justify-end sm:gap-2">
            {SATELLITES.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  data-satellite={s.id}
                  aria-haspopup="dialog"
                  aria-expanded={selected === s.id}
                  data-active={hovered === s.id || selected === s.id}
                  onClick={(e) => select(s.id, e.detail ? e : undefined)}
                  onPointerEnter={() => setHovered(s.id)}
                  onPointerLeave={() => setHovered(null)}
                  onFocus={() => setHovered(s.id)}
                  onBlur={() => setHovered(null)}
                  className="satellite-chip"
                >
                  {s.name}
                  <span className="satellite-chip-tag">{INSTRUMENTS[s.instrument].label}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      {sat ? (
        <SatellitePanel sat={sat} role={satelliteRole(sat.id, calibration)} side={side} onClose={close} />
      ) : null}
    </div>
  );
});

export default GlobeHero;
