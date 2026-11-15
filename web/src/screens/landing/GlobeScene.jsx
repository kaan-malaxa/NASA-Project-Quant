import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, Line, useTexture } from "@react-three/drei";
import { AdditiveBlending, BackSide, Color, SRGBColorSpace } from "three";
import { FIT_RADIUS, INCLINATION_DEG, SATELLITES, SHELLS } from "./satellites.js";
import { cameraDistance, orbitPoint, orbitRing } from "./orbits.js";
import { EARTH_TEXTURE_URL } from "./earthTexture.js";

/**
 * The 3D landing scene: Earth, atmosphere glow, five satellites on their orbit lines.
 * This file is loaded lazily (its own chunk, with three.js); nothing else in the app imports three.
 * Scene colours are the scene's own (not page tokens): a drawing of space, not a chart.
 */
const COLORS = {
  glow: "#4dffc3",
  orbit: "#5fb8b0",
  orbitActive: "#8dffd6",
  body: "#dfe9ee",
  panel: "#2f6fd6",
  active: "#8dffd6",
  star: "#bfeee2",
};
const FOV = 36;
const TILT = (-23.4 * Math.PI) / 180;
const stop = (e) => e.stopPropagation();

const GLOW_VERTEX = `
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;
// Outer halo, drawn on the inside of a larger sphere: brightest at the Earth's edge, fading to nothing at the shell's edge.
const HALO_FRAGMENT = `
  uniform vec3 uColor;
  uniform float uLimb;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    float d = clamp(-dot(vNormal, vView) / uLimb, 0.0, 1.0);
    gl_FragColor = vec4(uColor, pow(d, 3.0) * 0.42);
  }
`;
// Thin rim on the Earth itself.
const RIM_FRAGMENT = `
  uniform vec3 uColor;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    float f = pow(1.0 - clamp(dot(vNormal, vView), 0.0, 1.0), 3.0);
    gl_FragColor = vec4(uColor, f * 0.35);
  }
`;
const HALO_SCALE = 1.22;

function CameraRig() {
  const { camera, size } = useThree();
  useLayoutEffect(() => {
    camera.position.set(0, 0.55, cameraDistance(FIT_RADIUS, FOV, size.width / Math.max(1, size.height)));
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }, [camera, size.width, size.height]);
  return null;
}

/**
 * Moves and scales the globe and its satellites for the scroll story. `story.current` = { t, globe: {cx, cy, scale} }:
 * cx, cy are the target centre as shares of the canvas width and height; t blends from the centre to the target.
 * Read every frame from a ref, so scrolling never re-renders React.
 */
function StoryRig({ story, children }) {
  const ref = useRef(null);
  const { camera, size } = useThree();
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    const t = story?.current?.t ?? 0;
    const target = story?.current?.globe;
    if (!target || !(t > 0)) {
      g.position.set(0, 0, 0);
      g.scale.setScalar(1);
      return;
    }
    const halfH = camera.position.length() * Math.tan((FOV * Math.PI) / 360);
    const halfW = halfH * (size.width / Math.max(1, size.height));
    g.position.set((target.cx - 0.5) * 2 * halfW * t, -(target.cy - 0.5) * 2 * halfH * t, 0);
    g.scale.setScalar(1 + (target.scale - 1) * t);
  });
  return <group ref={ref}>{children}</group>;
}

function Earth({ moving, onReady }) {
  const map = useTexture(EARTH_TEXTURE_URL);
  const ref = useRef(null);
  useEffect(() => {
    map.colorSpace = SRGBColorSpace;
    map.anisotropy = 8;
    map.needsUpdate = true;
    onReady?.();
  }, [map, onReady]);
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

function Atmosphere() {
  const halo = useMemo(
    () => ({
      uColor: { value: new Color(COLORS.glow) },
      uLimb: { value: Math.sqrt(1 - 1 / (HALO_SCALE * HALO_SCALE)) },
    }),
    [],
  );
  const rim = useMemo(() => ({ uColor: { value: new Color(COLORS.glow) } }), []);
  return (
    <>
      <mesh scale={1.006} raycast={() => null}>
        <sphereGeometry args={[1, 64, 64]} />
        <shaderMaterial
          vertexShader={GLOW_VERTEX}
          fragmentShader={RIM_FRAGMENT}
          uniforms={rim}
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </mesh>
      <mesh scale={HALO_SCALE} raycast={() => null}>
        <sphereGeometry args={[1, 64, 64]} />
        <shaderMaterial
          vertexShader={GLOW_VERTEX}
          fragmentShader={HALO_FRAGMENT}
          uniforms={halo}
          side={BackSide}
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </mesh>
    </>
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

function Satellite({ sat, moving, active, selected, onHover, onSelect }) {
  const shell = SHELLS[sat.shell];
  const ref = useRef(null);
  const angle = useRef(sat.phase);
  const ring = useMemo(() => orbitRing(shell.radius, INCLINATION_DEG, sat.raan), [shell.radius, sat.raan]);

  const place = () => {
    if (!ref.current) return;
    ref.current.position.set(...orbitPoint(shell.radius, INCLINATION_DEG, sat.raan, angle.current));
    ref.current.lookAt(0, 0, 0);
  };
  useLayoutEffect(place);
  useFrame((_, dt) => {
    if (!moving) return;
    angle.current += Math.min(dt, 0.1) * shell.speed;
    place();
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
      frameloop={!running ? "never" : moving ? "always" : "demand"}
      camera={{ fov: FOV, near: 0.1, far: 120, position: [0, 0.55, 7] }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      aria-hidden="true"
    >
      <CameraRig />
      <ambientLight intensity={0.07} />
      <directionalLight position={[5, 2.2, 3.5]} intensity={2.8} />
      <Stars />
      <StoryRig story={story}>
        <group rotation={[0, 0, TILT]}>
          <Suspense fallback={null}>
            <Earth moving={moving} onReady={onReady} />
          </Suspense>
          <Atmosphere />
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
          />
        ))}
      </StoryRig>
    </Canvas>
  );
}
