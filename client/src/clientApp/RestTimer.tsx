import { useEffect, useRef, useState } from "react";
import { clock } from "./planLines";

/**
 * A rest countdown (Prompt 79; a compact bar since the client UI pass, Nov 2026). Counts from the wall
 * clock, so a backgrounded tab still ends on time. Picking a rest (or ticking a set) starts it at once;
 * it offers Pause / Resume, +30 s and a close. "Rest over" is announced through an aria-live region.
 */
export function RestTimer({
  seconds,
  label,
  nonce = 0,
  autoStart = false,
  onDismiss,
}: {
  seconds: number;
  label: string;
  nonce?: number;
  autoStart?: boolean;
  onDismiss?: () => void;
}) {
  const [remaining, setRemaining] = useState(seconds);
  const [running, setRunning] = useState(false);
  const [announce, setAnnounce] = useState("");
  const endAt = useRef(0);

  // Picking an exercise's rest (even the same one again) resets - and starts - the timer.
  useEffect(() => {
    setRemaining(seconds);
    setAnnounce("");
    if (autoStart) {
      endAt.current = Date.now() + seconds * 1000;
      setRunning(true);
    } else {
      setRunning(false);
    }
  }, [seconds, label, nonce, autoStart]);

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
  const plus30 = () => {
    endAt.current = (running ? endAt.current : Date.now() + remaining * 1000) + 30_000;
    setRemaining((r) => r + 30);
    if (!running) setRunning(true);
  };

  return (
    <section aria-label="Rest timer" className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3 shadow-lg">
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold uppercase tracking-wide text-dim">Rest · {label}</p>
        <p className="font-mono text-2xl font-bold text-text" aria-hidden="true">
          {clock(remaining)}
        </p>
        <p className="sr-only">{`${remaining} seconds left`}</p>
      </div>
      {running ? (
        <button type="button" className="btn btn-secondary min-h-11" onClick={() => setRunning(false)}>
          Pause
        </button>
      ) : (
        <button type="button" className="btn btn-primary min-h-11" onClick={start}>
          {remaining === seconds || remaining === 0 ? "Start" : "Resume"}
        </button>
      )}
      <button type="button" className="btn btn-secondary min-h-11 px-3" onClick={plus30}>
        +30 s
      </button>
      {onDismiss && (
        <button type="button" aria-label="Close the rest timer" onClick={onDismiss} className="btn btn-ghost min-h-11 px-3 text-dim">
          ✕
        </button>
      )}
      <p role="status" aria-live="polite" className="sr-only">
        {announce}
      </p>
    </section>
  );
}
