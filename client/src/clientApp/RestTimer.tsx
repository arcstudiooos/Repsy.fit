import { useEffect, useRef, useState } from "react";
import { clock } from "./planLines";

/**
 * A rest countdown (Prompt 79). Counts from the wall clock, so a backgrounded tab still ends on time.
 * "Rest over" is announced through an aria-live region; nothing moves (no animation to reduce).
 */
export function RestTimer({ seconds, label, nonce = 0 }: { seconds: number; label: string; nonce?: number }) {
  const [remaining, setRemaining] = useState(seconds);
  const [running, setRunning] = useState(false);
  const [announce, setAnnounce] = useState("");
  const endAt = useRef(0);

  // Picking an exercise's rest (even the same one again) resets the timer.
  useEffect(() => {
    setRemaining(seconds);
    setRunning(false);
    setAnnounce("");
  }, [seconds, label, nonce]);

  useEffect(() => {
    if (!running) return;
    const tick = () => {
      const left = Math.max(0, Math.ceil((endAt.current - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0) {
        setRunning(false);
        setAnnounce("Rest over");
      }
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [running]);

  const start = () => {
    const from = remaining === 0 ? seconds : remaining;
    endAt.current = Date.now() + from * 1000;
    setRemaining(from);
    setAnnounce("");
    setRunning(true);
  };
  const btn = "min-h-11 rounded-lg border border-border bg-surface2 px-4 text-sm font-semibold text-text hover:border-dim";

  return (
    <section aria-label="Rest timer" className="rounded-lg border border-border bg-surface p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-dim">Rest timer · {label}</p>
      <p className="mt-1 font-mono text-4xl font-bold text-text" aria-hidden="true">
        {clock(remaining)}
      </p>
      <p className="sr-only">{`${remaining} seconds left`}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {running ? (
          <button type="button" className={btn} onClick={() => setRunning(false)}>
            Pause
          </button>
        ) : (
          <button type="button" className="btn-primary min-h-11 rounded-lg px-4 text-sm" onClick={start}>
            {remaining === seconds || remaining === 0 ? "Start rest" : "Resume"}
          </button>
        )}
        <button
          type="button"
          className={btn}
          onClick={() => {
            setRunning(false);
            setRemaining(seconds);
            setAnnounce("");
          }}
        >
          Reset
        </button>
      </div>
      <p role="status" aria-live="polite" className="mt-2 min-h-5 text-sm font-semibold text-accent2">
        {announce}
      </p>
    </section>
  );
}
