import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, Line, useTexture } from "@react-three/drei";
import { SRGBColorSpace, Vector3 } from "three";
import { FIT_RADIUS, INCLINATION_DEG, SATELLITES, SHELLS } from "./satellites.js";
import { cameraDistance, orbitPoint, orbitRing } from "./orbits.js";
import { EARTH_TEXTURE_URL } from "./earthTexture.js";

/**
 * The 3D landing scene: Earth (day and night shading, no atmosphere glow), five satellites on their orbit lines.
 * This file is loaded lazily (its own chunk, with three.js); nothing else in the app imports three.
 * Scene colours are the scene's own (not page tokens): a drawing of space, not a chart.
 */
const COLORS = {
  orbit: "#5fb8b0",
  orbitActive: "#8dffd6",
  body: "#dfe9ee",
  panel: "#2f6fd6",
  active: "#8dffd6",
  star: "#bfeee2",
};
// A long lens: the hero globe is very large and close to the frame, and a wide angle would distort it.
const FOV = 20;
const TILT = (-23.4 * Math.PI) / 180;
const VIEW_TILT = 0.125; // radians
const stop = (e) => e.stopPropagation();

function CameraRig() {
  const { camera, size } = useThree();
  useLayoutEffect(() => {
    camera.position.set(0, 0, cameraDistance(FIT_RADIUS, FOV, size.width / Math.max(1, size.height)));
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }, [camera, size.width, size.height]);
  return null;
}

/**
 * Places the globe and its satellites. `story.current` = { t, hero, globe }: hero and globe are placements
 * ({ cx, cy, scale }, centre as shares of the canvas width and height) before and after the scroll move; t blends them.
 * Read every frame from a ref, so scrolling never re-renders React. `story.current.invalidate` asks for a frame when
 * nothing else is animating (reduced motion renders on demand).
 */
function StoryRig({ story, children }) {
  const ref = useRef(null);
  const { camera, size, invalidate } = useThree();
  useEffect(() => {
    if (!story?.current) return;
    story.current.invalidate = invalidate;
    invalidate();
    return () => {
      if (story.current?.invalidate === invalidate) story.current.invalidate = null;
    };
  }, [story, invalidate]);
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    const s = story?.current;
    const a = s?.hero;
    if (!a) {
      g.position.set(0, 0, 0);
      g.scale.setScalar(1);
      return;
    }
    const b = s.globe ?? a;
    const t = s.t ?? 0;
    const cx = a.cx + (b.cx - a.cx) * t;
    const cy = a.cy + (b.cy - a.cy) * t;
    const halfH = camera.position.length() * Math.tan((FOV * Math.PI) / 360);
    const halfW = halfH * (size.width / Math.max(1, size.height));
    g.position.set((cx - 0.5) * 2 * halfW, -(cy - 0.5) * 2 * halfH, 0);
    g.scale.setScalar(a.scale + (b.scale - a.scale) * t);
    // For the satellites: where the Earth is and how big (world units), this frame.
    s.center = g.position;
    s.scaleNow = g.scale.x;
  });
  // The camera looks straight ahead (so screen placement maps exactly); the scene itself tips its north toward the
  // viewer a little, for the "seen from slightly above" look.
  return (
    <group ref={ref}>
      <group rotation={[VIEW_TILT, 0, 0]}>{children}</group>
    </group>
  );
}

/**
 * The Earth. Once the texture has downloaded it is uploaded to the GPU (initTexture) and the scene's shaders are
 * compiled; then `onTexture` fires, and after two frames have actually been rendered with it, `onReady`.
 */
function Earth({ moving, onReady, onTexture }) {
  const map = useTexture(EARTH_TEXTURE_URL);
  const ref = useRef(null);
  const { gl, scene, camera, invalidate } = useThree();
  const frames = useRef(-1); // -1 = texture not ready yet
  useEffect(() => {
    map.colorSpace = SRGBColorSpace;
    map.anisotropy = 8;
    map.needsUpdate = true;
    try {
      gl.initTexture?.(map);
      gl.compile?.(scene, camera);
    } catch {
      /* the first render uploads and compiles instead */
    }
    onTexture?.();
    frames.current = 0;
    invalidate();
  }, [map, gl, scene, camera, invalidate, onTexture]);
  useFrame(() => {
    if (frames.current < 0 || frames.current > 2) return;
    frames.current += 1;
    // This callback runs before each render: the third call means two frames have been drawn with the texture.
    if (frames.current === 3) onReady?.();
    else invalidate();
  });
  useFrame((_, dt) => {
    if (moving && ref.current) ref.current.rotation.y += Math.min(dt, 0.1) * 0.05;
  });
  return (
    <mesh ref={ref} rotation={[0, -1.9, 0]} onPointerOver={stop} onPointerMove={stop} onClick={stop}>
      <sphereGeometry args={[1, 64, 64]} />
      <meshStandardMaterial map={map} roughness={1} metalness={0} />
    </mesh>
  );
}

/** A fixed, seeded field of faint stars (deterministic: the same picture on every load). */
function Stars({ count = 500 }) {
  const positions = useMemo(() => {
    let seed = 20261115;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    const arr = new Float32Array(count * 3);
    for (let n = 0; n < count; n++) {
      const u = rnd() * 2 - 1;
      const t = rnd() * 2 * Math.PI;
      const r = 30 + rnd() * 20;
      const s = Math.sqrt(1 - u * u);
      arr.set([r * s * Math.cos(t), r * u, r * s * Math.sin(t)], n * 3);
    }
    return arr;
  }, [count]);
  return (
    <points raycast={() => null}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color={COLORS.star}
        size={0.12}
        sizeAttenuation
        transparent
        opacity={0.7}
        depthWrite={false}
      />
    </points>
  );
}

/** How much faster a satellite moves while it cannot be seen (off-screen or behind the Earth). */
const HIDDEN_SPEEDUP = 8;

function Satellite({ sat, moving, active, selected, onHover, onSelect, story }) {
  const shell = SHELLS[sat.shell];
  const ref = useRef(null);
  const sizeRef = useRef(null);
  const angle = useRef(sat.phase);
  const { camera, invalidate } = useThree();
  const world = useMemo(() => new Vector3(), []);
  const ndc = useMemo(() => new Vector3(), []);
  const settle = useRef({ hero: undefined, turned: 0 });

  /** On screen, and not behind the Earth? */
  const visible = () => {
    const g = ref.current;
    if (!g) return true;
    g.getWorldPosition(world);
    ndc.copy(world).project(camera);
    if (Math.abs(ndc.x) > 0.94 || Math.abs(ndc.y) > 0.94) return false;
    const c = story?.current?.center;
    const r = story?.current?.scaleNow ?? 1;
    if (c) {
      const dx = world.x - c.x;
      const dy = world.y - c.y;
      if (world.z < c.z && dx * dx + dy * dy < r * r) return false;
    }
    return true;
  };
  const ring = useMemo(() => orbitRing(shell.radius, INCLINATION_DEG, sat.raan), [shell.radius, sat.raan]);

  const place = () => {
    if (!ref.current) return;
    ref.current.position.set(...orbitPoint(shell.radius, INCLINATION_DEG, sat.raan, angle.current));
    ref.current.lookAt(0, 0, 0);
  };
  useLayoutEffect(place);
  useFrame((_, dt) => {
    // Keep the model the same size on screen when the whole globe is scaled up (the big hero).
    // (A bit more than 1/scale: on the big globe the satellites also pass close to the camera.)
    sizeRef.current?.scale.setScalar(Math.pow(Math.max(1, story?.current?.scaleNow ?? 1), -1.7));
    if (moving) {
      // Satellites hurry through the part of the orbit nobody can see, so most of the time they are in view.
      angle.current += Math.min(dt, 0.1) * shell.speed * (visible() ? 1 : HIDDEN_SPEEDUP);
      place();
      return;
    }
    // Reduced motion: no orbiting, but each satellite rests where it can be seen and clicked (search once per layout).
    const hero = story?.current?.hero;
    if (settle.current.hero !== hero) settle.current = { hero, turned: 0 };
    if (settle.current.turned < 2 * Math.PI && !visible()) {
      angle.current += 0.06;
      settle.current.turned += 0.06;
      place();
      invalidate();
    }
  });

  const over = (e) => {
    e.stopPropagation();
    onHover(sat.id);
  };
  const out = () => onHover(null);
  const click = (e) => {
    e.stopPropagation();
    onSelect(sat.id, e.nativeEvent);
  };
  const lit = active || selected;

  return (
    <>
      <Line
        points={ring}
        color={lit ? COLORS.orbitActive : COLORS.orbit}
        lineWidth={lit ? 2.4 : 1}
        transparent
        opacity={lit ? 1 : 0.45}
        raycast={() => null}
      />
      <group ref={ref}>
        <group ref={sizeRef}>
          <group scale={lit ? 1.45 : 1}>
            <mesh>
              <boxGeometry args={[0.05, 0.05, 0.075]} />
              <meshStandardMaterial
                color={COLORS.body}
                emissive={lit ? COLORS.active : COLORS.body}
                emissiveIntensity={lit ? 0.9 : 0.35}
                roughness={0.5}
              />
            </mesh>
            {[-1, 1].map((side) => (
              <mesh key={side} position={[side * 0.082, 0, 0]}>
                <boxGeometry args={[0.1, 0.006, 0.045]} />
                <meshStandardMaterial
                  color={COLORS.panel}
                  emissive={lit ? COLORS.active : COLORS.panel}
                  emissiveIntensity={lit ? 0.6 : 0.5}
                  roughness={0.4}
                />
              </mesh>
            ))}
          </group>
          {/* A larger invisible target, so the small model is easy to hover and tap. */}
          <mesh onPointerOver={over} onPointerOut={out} onClick={click}>
            <sphereGeometry args={[0.15, 12, 12]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
          {lit ? (
            <Html center position={[0, 0, -0.2]} zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
              <span aria-hidden="true" className="globe-label">
                {sat.name}
              </span>
            </Html>
          ) : null}
        </group>
      </group>
    </>
  );
}

/**
 * @param {object} props
 * @param {boolean} props.running render frames (false while the hero is off screen or the tab is hidden)
 * @param {boolean} props.moving spin the Earth and move the satellites (false with prefers-reduced-motion)
 * @param {string | null} props.hovered satellite id highlighted from outside (the button list) or by the pointer
 * @param {string | null} props.selected satellite id whose panel is open
 * @param {(id: string | null) => void} props.onHover
 * @param {(id: string, event?: MouseEvent) => void} props.onSelect
 * @param {() => void} [props.onReady] called once the Earth texture is on the globe
 * @param {{ current: { t: number, globe?: object } }} [props.story] scroll-story position (see StoryRig)
 */
export default function GlobeScene({
  running,
  hold = false,
  onTexture,
  moving,
  hovered,
  selected,
  onHover,
  onSelect,
  onReady,
  story,
}) {
  useEffect(() => {
    document.body.style.cursor = hovered ? "pointer" : "";
    return () => {
      document.body.style.cursor = "";
    };
  }, [hovered]);

  return (
    <Canvas
      dpr={[1, 2]}
      // Under the loader (`hold`) only the frames the Earth asks for are drawn; then the scene runs normally.
      frameloop={!running ? "never" : moving && !hold ? "always" : "demand"}
      camera={{ fov: FOV, near: 0.1, far: 120, position: [0, 0, 7] }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      aria-hidden="true"
    >
      <CameraRig />
      <ambientLight intensity={0.12} />
      {/* Sunlight from the front-left: lights the part of the big hero globe that is on screen, keeps a night side. */}
      <directionalLight position={[-3, 2.5, 5]} intensity={2.6} />
      <Stars />
      <StoryRig story={story}>
        <group rotation={[0, 0, TILT]}>
          <Suspense fallback={null}>
            <Earth moving={moving} onReady={onReady} onTexture={onTexture} />
          </Suspense>
        </group>
        {SATELLITES.map((sat) => (
          <Satellite
            key={sat.id}
            sat={sat}
            moving={moving}
            active={hovered === sat.id}
            selected={selected === sat.id}
            onHover={onHover}
            onSelect={onSelect}
            story={story}
          />
        ))}
      </StoryRig>
    </Canvas>
  );
}
