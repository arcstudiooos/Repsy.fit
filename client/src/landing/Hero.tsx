// Hero section (Prompt 38): the interactive 3D scene, or a static poster when 3D can't or
// shouldn't run (no WebGL, reduced motion, phone / low-power device, or a WebGL failure).
import { Component, Suspense, lazy, useEffect, useRef, useState, type ReactNode } from "react";
import posterRing from "./poster-ring.svg";
import { useLandingEnv } from "./useLandingEnv";

const Hero3D = lazy(() => import("./Hero3D"));

/** Any error inside the 3D chunk (load or render) shows the poster instead - never a blank hero. */
class Fallback extends Component<{ children: ReactNode; fallback: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function Poster() {
  return (
    <div data-testid="hero-poster" className="landing-poster flex h-full w-full items-center justify-end">
      <img src={posterRing} alt="" width={200} height={200} className="mr-[6%] hidden h-72 w-72 md:block" />
    </div>
  );
}

/** True while the element is on screen; used to pause 3D rendering when scrolled away. */
function useOnScreen<T extends Element>() {
  const ref = useRef<T>(null);
  const [onScreen, setOnScreen] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return [ref, onScreen] as const;
}

/** True once the page has loaded and the browser is idle, so Three.js never competes with the
 *  first paint (the poster shows until then). */
function useAfterLoadIdle(enabled: boolean) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let idleId: number | undefined;
    const go = () => {
      const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
      const done = () => !cancelled && setReady(true);
      if (w.requestIdleCallback) idleId = w.requestIdleCallback(done, { timeout: 1500 });
      else idleId = window.setTimeout(done, 200);
    };
    if (document.readyState === "complete") go();
    else window.addEventListener("load", go, { once: true });
    return () => {
      cancelled = true;
      window.removeEventListener("load", go);
      if (idleId !== undefined) window.clearTimeout(idleId);
    };
  }, [enabled]);
  return ready;
}

export function Hero() {
  const env = useLandingEnv();
  const [failed, setFailed] = useState(false);
  const [ref, onScreen] = useOnScreen<HTMLElement>();
  const idle = useAfterLoadIdle(env.canRun3D);
  const show3D = env.canRun3D && !failed && idle;

  return (
    <section
      ref={ref}
      className="landing-dark relative -mt-[72px] overflow-hidden pt-[72px]"
      data-reduced-motion={env.reducedMotion}
      data-light-mode={env.lightMode}
      data-webgl={env.webgl}
      data-3d={env.canRun3D && !failed}
      data-rendering={show3D && onScreen}
      aria-labelledby="hero-title"
    >
      {/* Canvas layer: behind the text, never takes pointer events. */}
      <div className="pointer-events-none absolute inset-0" aria-hidden={!show3D}>
        {show3D ? (
          <Fallback fallback={<Poster />} onError={() => setFailed(true)}>
            <Suspense fallback={<Poster />}>
              <Hero3D active={onScreen} onFail={() => setFailed(true)} />
            </Suspense>
          </Fallback>
        ) : (
          <Poster />
        )}
      </div>
      {/* Dark scrim so the text stays readable over the scene (stronger on phones). */}
      <div className="landing-scrim pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="relative mx-auto flex min-h-[600px] max-w-[1100px] flex-col justify-center px-4 py-20 md:h-[720px]">
        <p className="l-kicker">Repsy Coach · for fitness coaches</p>
        <h1 id="hero-title" className="l-display mt-4 max-w-2xl">
          <span className="block">Coach every client.</span>{" "}
          <span className="block" style={{ color: "#ff4a1f" }}>
            Let AI do the planning busywork.
          </span>
        </h1>
        <p className="mt-6 max-w-lg text-lg text-white/85">
          Repsy suggests plans for each client with the reasoning shown, and nothing is saved until
          you assign it. Prefer to plan yourself? Build workouts with sets, reps and rest by hand.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <a href="/app" className="btn-primary flex min-h-10 items-center rounded-lg px-5 text-sm">
            Start free
          </a>
          <a
            href="#demo"
            className="flex min-h-10 items-center rounded-lg border border-white/30 px-5 text-sm font-semibold text-white hover:border-white/60"
          >
            See it in action
          </a>
        </div>
      </div>
    </section>
  );
}

// Signature band: real set notation, the way the Manual Planner writes it. Decorative.
const LOG = [
  "Back Squat 4 × 6 · Rest 120s",
  "Romanian Deadlift 3 × 8 · Rest 90s",
  "Bench Press 4 × 6 · Rest 120s",
  "Barbell Row 3 × 10 · Rest 60s",
  "Walking Lunge 3 × 10 · Rest 60s",
  "Hip Thrust 3 × 12 · Rest 60s",
];

export function TrainingLogBand() {
  return (
    <div className="landing-band" aria-hidden="true">
      <div className="mx-auto flex h-14 max-w-[1200px] items-center gap-10 px-5 md:px-8 text-lg">
        {LOG.map((l) => (
          <span key={l}>{l}</span>
        ))}
      </div>
    </div>
  );
}
