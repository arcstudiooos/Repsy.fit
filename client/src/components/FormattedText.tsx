import type { ReactNode } from "react";
import { parsePlanLines } from "../clientApp/planLines";

/** **bold** inside a line, as <strong>. Everything else stays plain text (never HTML). */
export function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    /^\*\*[^*]+\*\*$/.test(part) ? (
      <strong key={i} className="font-semibold">
        {part.slice(2, -2)}
      </strong>
    ) : (
      part.replace(/\*\*/g, "")
    ),
  );
}

/** AI chat text: short paragraphs, "- " bullet lists, "1. " numbered lists and **bold**. */
export function FormattedText({ text, className = "" }: { text: string; className?: string }) {
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let para: string[] = [];
  const flushPara = () => {
    if (para.length === 0) return;
    const lines = para;
    blocks.push(
      <p key={blocks.length}>
        {lines.map((l, i) => (
          <span key={i}>
            {i > 0 && <br />}
            {inline(l)}
          </span>
        ))}
      </p>,
    );
    para = [];
  };
  const flushList = () => {
    if (!list) return;
    const items = list.items.map((it, i) => <li key={i}>{inline(it)}</li>);
    blocks.push(
      list.ordered ? (
        <ol key={blocks.length} className="list-decimal space-y-1 pl-5">
          {items}
        </ol>
      ) : (
        <ul key={blocks.length} className="list-disc space-y-1 pl-5">
          {items}
        </ul>
      ),
    );
    list = null;
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const bullet = /^[-*•]\s+(.*)$/.exec(line);
    const numbered = /^\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      flushPara();
      const ordered = !bullet;
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { ordered, items: [] };
      }
      list.items.push((bullet ?? numbered)![1]);
      continue;
    }
    flushList();
    // Consecutive lines stay one paragraph (line breaks kept); a blank line starts a new one.
    if (line) para.push(line.replace(/^#+\s*/, ""));
    else flushPara();
  }
  flushPara();
  flushList();
  return <div className={`space-y-2 ${className}`}>{blocks}</div>;
}

/** A plan's details: day headings, and each exercise as a row with sets × reps, load and rest. */
export function PlanDetails({ details }: { details: string }) {
  const lines = parsePlanLines(details);
  if (!lines.some((l) => l.kind !== "text")) return <FormattedText text={details} className="plan-details space-y-1" />;
  return (
    <div className="plan-details space-y-1.5 text-sm">
      {lines.map((l, i) =>
        l.kind === "day" ? (
          <p key={i} className={`font-semibold text-text ${i > 0 ? "pt-2" : ""}`}>
            {l.text}
          </p>
        ) : l.kind === "exercise" ? (
          <div key={i} data-plan-line="exercise" className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-baseline gap-x-2 border-b border-border pb-1.5 last:border-b-0">
            <span className="font-mono text-xs text-dim">{l.n}</span>
            <span className="min-w-0 text-text">{l.name}</span>
            <span className="whitespace-nowrap font-mono text-xs text-text">
              {l.sets} × {l.reps}
              {l.load ? ` · ${l.load}` : ""} · {l.restSec}s
            </span>
          </div>
        ) : (
          <p key={i} className="text-text">
            {inline(l.text)}
          </p>
        ),
      )}
    </div>
  );
}
