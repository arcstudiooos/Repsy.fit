// Landing hero, design "A1 · Clipboard" (approved by the user, see DESIGN.md).
// A coach's clipboard holding one client's session sheet, with the AI suggestion stuck on as a
// note. Built in HTML / CSS only (no images, no 3D, no animation library), so it paints with the
// first render. Sample data is the same Maya Patel example used across the landing page.
const ROWS: [string, string, string, boolean][] = [
  ["Back Squat", "4 × 6", "120s", true],
  ["Romanian Deadlift", "3 × 8", "90s", true],
  ["Walking Lunge", "3 × 10", "60s", false],
];

export function ClipboardHero() {
  return (
    <section aria-labelledby="hero-title" className="a1-hero relative -mt-[72px] pt-[72px]" data-hero="clipboard">
      <div className="mx-auto grid max-w-[1200px] items-center gap-14 px-5 pb-24 pt-10 md:px-8 lg:grid-cols-[1fr_440px] xl:grid-cols-[1fr_470px] lg:pb-32 lg:pt-16">
        <div>
          <p className="a1-stamp">Reasoning included</p>
          <h1 id="hero-title" className="a1-display mt-7">
            Plans with the{" "}
            <span className="whitespace-nowrap">
              <em className="a1-underlined">
                why
                <svg viewBox="0 0 200 20" preserveAspectRatio="none" aria-hidden="true" focusable="false">
                  <path d="M4 14 C 60 4, 120 4, 196 10" />
                </svg>
              </em>{" "}
              written in.
            </span>
          </h1>
          <p className="mt-8 max-w-[34ch] text-lg leading-relaxed md:text-xl" style={{ color: "rgba(26, 26, 26, 0.82)" }}>
            Repsy's AI drafts each client's next plan and writes down why. You read it, assign it,
            or change it by hand with sets, reps and rest.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-x-7 gap-y-4">
            <a href="/app" className="btn-primary a1-btn">
              Start free
            </a>
            <a href="#demo" className="a1-textlink">
              See it in action
            </a>
          </div>
        </div>

        {/* The clipboard. Its text is an example, so screen readers get one summary instead. */}
        <div
          className="a1-board"
          role="img"
          aria-label="Example: sample client Maya Patel's workout on a clipboard, with an AI suggestion note to add a lower-body strength day because her adherence rose from 72% to 86%."
        >
          <div className="a1-clip" />
          <div className="a1-sheet">
            <div className="a1-sheet-top">
              <span className="a1-serif text-[28px] leading-none md:text-[32px]">Maya Patel</span>
              <span className="a1-mono text-right text-[10.5px] uppercase leading-relaxed tracking-[0.08em]" style={{ color: "#6b6560" }}>
                Sample client
                <br />
                Fat loss + strength
              </span>
            </div>
            <table className="a1-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Exercise</th>
                  <th>Sets × reps</th>
                  <th>Rest</th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map(([name, dose, rest, done], i) => (
                  <tr key={name} data-anim-row={i}>
                    <td className="a1-mono">{i + 1}</td>
                    <td>{name}</td>
                    <td className="a1-mono">{dose}</td>
                    <td className="a1-mono">
                      {rest} {done && <span className="a1-tick" style={{ animationDelay: `${0.5 + i * 0.35}s` }}>✓</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="a1-note" data-testid="hero-note">
              <p className="a1-mono text-[10.5px] font-semibold uppercase tracking-[0.12em]" style={{ color: "#92400e" }}>
                AI suggestion · Workout
              </p>
              <p className="mt-1.5 text-[15px] leading-snug">
                <b>Add a lower-body strength day.</b> Why: adherence climbed from 72% to 86%, so she
                can handle one heavier session.
              </p>
              <span className="a1-pill mt-3" title="Example only">
                Assign to Maya <span style={{ color: "#ff4a1f" }}>→</span>
              </span>
            </div>
          </div>
          <span className="a1-hand a1-scribble" aria-hidden="true">
            nice!
          </span>
        </div>
      </div>
    </section>
  );
}
