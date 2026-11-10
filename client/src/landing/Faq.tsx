// FAQ (Prompt 41): plain answers that match what v1 does today.
export const FAQS: [string, string][] = [
  [
    "What does Repsy Coach do?",
    "It's a dashboard for coaching many clients. Ask the AI Coach about a client and it answers using their goal, level, plans and check-ins. It can suggest or auto-assign Workout, Nutrition, Habit and Recovery plans with the reasoning attached, and the Progress tab charts each client's weekly check-ins.",
  ],
  [
    "Who is it for?",
    "Personal trainers and fitness coaches who plan for several clients and want less time on admin.",
  ],
  [
    "Does the AI replace the coach?",
    "No. The AI suggests, you decide: a suggestion is only saved when you tap Assign, and you can plan by hand instead. Its advice is general wellness only - it doesn't diagnose, and it can be wrong, so you review every plan.",
  ],
  [
    "Can I plan manually?",
    "Yes. The Manual Planner lets you search the exercise library, set sets, reps and rest for each exercise, save it as a numbered workout and mark plans Active, Done or Paused.",
  ],
  [
    "Is my client data private?",
    "Client data is stored in Repsy's own database, and a client's details are sent to the AI provider only when you ask the AI about that client. Honest note: v1 has no login yet, so anyone with the app link can open the dashboard. Until accounts arrive, use sample data or first names only.",
  ],
  [
    "Can I cancel?",
    "There's no billing in the app yet, so there's nothing to cancel today. Leaving your email below just puts you on the list.",
  ],
];

export default function Faq() {
  return (
    <div className="mt-10 flex flex-col">
      {FAQS.map(([q, a]) => (
        <details key={q} className="l-rule group py-1" data-testid="faq">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-3 text-lg font-bold">
            {q}
            <span aria-hidden="true" className="text-2xl transition-transform group-open:rotate-45" style={{ color: "#ff4a1f" }}>
              +
            </span>
          </summary>
          <p className="landing-dim max-w-3xl pb-5">{a}</p>
        </details>
      ))}
    </div>
  );
}
