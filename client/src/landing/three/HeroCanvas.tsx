// The 3D hero canvas. Lives in its own lazy chunk (with three / @react-three/*), so neither
// the first paint of the landing page nor any /app page waits for Three.js.
// Prompt 37 sets up the foundation only; Prompt 38 builds the real scene.
import { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import type { Mesh } from "three";

const ORANGE = "#FF4A1F";
const CREAM = "#FAF7F2";

function Ring() {
  const ref = useRef<Mesh>(null);
  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.y += delta * 0.3;
  });
  return (
    <mesh ref={ref} position={[1.8, 0, 0]}>
      <torusGeometry args={[1.2, 0.18, 24, 96]} />
      <meshStandardMaterial color={ORANGE} roughness={0.6} metalness={0} />
    </mesh>
  );
}

export default function HeroCanvas() {
  return (
    <Canvas dpr={[1, 2]} camera={{ position: [0, 0, 5], fov: 45 }} aria-label="Decorative 3D animation" role="img">
      <ambientLight intensity={0.4} />
      <pointLight position={[3, 3, 3]} color={ORANGE} intensity={40} />
      <pointLight position={[-3, -2, 2]} color={CREAM} intensity={10} />
      <Ring />
    </Canvas>
  );
}
