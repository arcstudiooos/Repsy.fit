// Interactive 3D hero (Prompt 38). Procedural geometry only - no model, font or texture files.
// A floating composition: a dumbbell, a progress ring that fills, chart bars that grow, and
// particles drifting upward. Pointer = smooth parallax tilt; scroll = the camera drifts down.
// This file (with three / @react-three/*) is its own lazy chunk; /app never loads it.
import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Color, MathUtils, Object3D, TorusGeometry, type Group, type InstancedMesh, type Mesh } from "three";

// Existing design-system colours only (CLAUDE.md).
const ORANGE = "#FF4A1F";
const CREAM = "#FAF7F2";
const TEAL = "#0E7C6B";
const AMBER = "#D97706";
const PURPLE = "#7C5CFC";
const GREY = "#333333";

const PARTICLES = 100; // max 120

/** Pointer position in -1..1, from window events so the canvas never needs pointer events. */
function usePointer() {
  const p = useRef({ x: 0, y: 0 });
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      p.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      p.current.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);
  return p;
}

function Dumbbell() {
  const ref = useRef<Group>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (!ref.current) return;
    ref.current.position.y = 1.25 + Math.sin(t * 1.1) * 0.12;
    ref.current.rotation.z = -0.35 + Math.sin(t * 0.6) * 0.08;
    ref.current.rotation.y = t * 0.25;
  });
  const plate = (x: number, r: number) => (
    <mesh position={[x, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
      <cylinderGeometry args={[r, r, 0.16, 32]} />
      <meshStandardMaterial color={ORANGE} roughness={0.65} metalness={0} />
    </mesh>
  );
  return (
    <group ref={ref} position={[0.2, 1.25, 0]}>
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.07, 0.07, 1.9, 16]} />
        <meshStandardMaterial color={CREAM} roughness={0.8} metalness={0} />
      </mesh>
      {plate(-0.72, 0.42)}
      {plate(-0.88, 0.32)}
      {plate(0.72, 0.42)}
      {plate(0.88, 0.32)}
    </group>
  );
}

/** A ring that fills from 0 to 100% and loops. The arc geometry is rebuilt ~20x a second. */
function ProgressRing() {
  const group = useRef<Group>(null);
  const fill = useRef<Mesh>(null);
  const last = useRef(-1);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (group.current) {
      group.current.position.y = -0.15 + Math.sin(t * 0.9 + 1) * 0.1;
      group.current.rotation.y = Math.sin(t * 0.4) * 0.35;
    }
    const step = Math.floor(t * 20);
    if (!fill.current || step === last.current) return;
    last.current = step;
    const progress = Math.min(1, (t % 6) / 4.5); // fill over 4.5 s, hold, loop every 6 s
    const arc = Math.max(0.001, progress * Math.PI * 2);
    fill.current.geometry.dispose();
    fill.current.geometry = new TorusGeometry(0.85, 0.12, 12, 64, arc);
  });
  return (
    <group ref={group} position={[-1.2, -0.15, 0]}>
      <mesh>
        <torusGeometry args={[0.85, 0.08, 12, 64]} />
        <meshStandardMaterial color={GREY} roughness={0.9} metalness={0} />
      </mesh>
      <mesh ref={fill} rotation={[0, 0, Math.PI / 2]} scale={[1, -1, 1]}>
        <torusGeometry args={[0.85, 0.12, 12, 64, 0.001]} />
        <meshStandardMaterial color={ORANGE} roughness={0.55} metalness={0} />
      </mesh>
    </group>
  );
}

/** 4 bars in the assignment type colours that grow, hold and loop. */
function ChartBars() {
  const bars = useRef<(Mesh | null)[]>([]);
  const group = useRef<Group>(null);
  const targets = [0.9, 1.4, 1.15, 1.8];
  const colours = [ORANGE, TEAL, AMBER, PURPLE];
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (group.current) group.current.position.y = -1.35 + Math.sin(t * 0.8 + 2) * 0.08;
    bars.current.forEach((bar, i) => {
      if (!bar) return;
      const phase = (t * 0.35 - i * 0.12) % 1; // grow during the first 60% of each loop
      const h = targets[i] * MathUtils.smoothstep(Math.min(Math.max(phase, 0) / 0.6, 1), 0, 1) + 0.05;
      bar.scale.y = h;
      bar.position.y = h / 2;
    });
  });
  return (
    <group ref={group} position={[0.75, -1.35, 0.2]} rotation={[0, -0.5, 0]}>
      {targets.map((_, i) => (
        <mesh key={i} ref={(m) => (bars.current[i] = m)} position={[i * 0.36, 0.5, 0]}>
          <boxGeometry args={[0.24, 1, 0.24]} />
          <meshStandardMaterial color={colours[i]} roughness={0.7} metalness={0} />
        </mesh>
      ))}
    </group>
  );
}

function Particles() {
  const ref = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);
  const seeds = useMemo(
    () =>
      Array.from({ length: PARTICLES }, (_, i) => {
        const r = (n: number) => (Math.sin(i * 12.9898 + n * 78.233) * 43758.5453) % 1;
        return { x: (Math.abs(r(1)) - 0.5) * 7, z: (Math.abs(r(2)) - 0.5) * 3 - 0.5, speed: 0.15 + Math.abs(r(3)) * 0.35, offset: Math.abs(r(4)) * 6, size: 0.015 + Math.abs(r(5)) * 0.03 };
      }),
    [],
  );
  useFrame(({ clock }) => {
    const mesh = ref.current;
    if (!mesh) return;
    const t = clock.elapsedTime;
    seeds.forEach((s, i) => {
      const y = ((s.offset + t * s.speed) % 6) - 3; // rise from -3 to 3, then wrap
      dummy.position.set(s.x + Math.sin(t * 0.5 + i) * 0.1, y, s.z);
      dummy.scale.setScalar(s.size);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, PARTICLES]}>
      <sphereGeometry args={[1, 8, 8]} />
      <meshBasicMaterial color={new Color(CREAM)} transparent opacity={0.28} />
    </instancedMesh>
  );
}

function Scene() {
  const root = useRef<Group>(null);
  const pointer = usePointer();
  useFrame(({ camera, clock }, delta) => {
    const g = root.current;
    if (!g) return;
    const k = 1 - Math.pow(0.04, delta); // frame-rate independent smoothing (no jumps)
    g.rotation.y = MathUtils.lerp(g.rotation.y, pointer.current.x * 0.35 + Math.sin(clock.elapsedTime * 0.15) * 0.1, k);
    g.rotation.x = MathUtils.lerp(g.rotation.x, pointer.current.y * 0.2, k);
    const drift = -Math.min(window.scrollY, 800) * 0.0015; // camera drifts down a little on scroll
    camera.position.y = MathUtils.lerp(camera.position.y, drift, k);
    camera.lookAt(0, drift, 0);
  });
  return (
    <group ref={root} position={[2.6, 0.1, 0]} scale={0.8}>
      <Dumbbell />
      <ProgressRing />
      <ChartBars />
      <Particles />
    </group>
  );
}

type Props = { active: boolean; onFail: () => void };

/** active=false pauses rendering (hero off-screen). onFail swaps in the static poster. */
export default function Hero3D({ active, onFail }: Props) {
  const [ready, setReady] = useState(false);
  return (
    <Canvas
      dpr={[1, 2]}
      frameloop={active ? "always" : "never"}
      camera={{ position: [0, 0, 6.5], fov: 45 }}
      gl={{ antialias: true, powerPreference: "high-performance", failIfMajorPerformanceCaveat: true }}
      onCreated={({ gl }) => {
        gl.domElement.addEventListener("webglcontextlost", onFail);
        setReady(true);
      }}
      aria-label="Decorative 3D animation"
      role="img"
      data-ready={ready}
      style={{ pointerEvents: "none" }}
    >
      <ambientLight intensity={0.35} />
      <spotLight position={[4, 5, 5]} angle={0.6} penumbra={0.8} color={ORANGE} intensity={120} />
      <directionalLight position={[-4, 2, -4]} color={CREAM} intensity={1.6} />
      <pointLight position={[-3, -2, 3]} color={CREAM} intensity={6} />
      <Scene />
    </Canvas>
  );
}
