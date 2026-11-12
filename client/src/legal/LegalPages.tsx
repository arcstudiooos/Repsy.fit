// Privacy Policy and Terms of Service. The text lives in ./content.json, which is the ONE source:
// this page renders it in the app, and client/scripts/prerender-legal.mjs renders the same JSON to
// static HTML (dist/legal/privacy.html, terms.html) that the server sends for /privacy and /terms,
// so crawlers such as Google's OAuth branding review see the full text without running JavaScript.
import { Fragment, useEffect } from "react";
import "../landing/landing.css";
import content from "./content.json";

type Block = string | { list: string[] };
type Doc = { title: string; intro: string; sections: { heading: string; body: Block[] }[] };

/** Emails and the one external URL in the text become links; everything else is plain text. */
const LINKABLE = /([\w.+-]+@[\w-]+(?:\.[\w-]+)+|myaccount\.google\.com\/permissions)/g;
function Linked({ text }: { text: string }) {
  const parts = text.split(LINKABLE);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <a key={i} className="underline" href={p.includes("@") ? `mailto:${p}` : `https://${p}`}>
            {p}
          </a>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  );
}

function LegalPage({ doc }: { doc: Doc }) {
  useEffect(() => {
    document.title = `${doc.title} - Repsy Coach`;
  }, [doc.title]);
  return (
    <div className="landing-cream a1 min-h-dvh">
      <header className="mx-auto flex max-w-[800px] items-center gap-4 px-5 py-6 md:px-8">
        <a href="/" className="flex min-h-10 items-center text-xl" style={{ fontFamily: "var(--font-serif)", fontStyle: "italic" }}>
          Repsy
        </a>
        <nav aria-label="Legal" className="ml-auto flex gap-1 text-sm">
          <a href="/privacy" className="flex min-h-10 items-center rounded-lg px-3 hover:underline">
            Privacy
          </a>
          <a href="/terms" className="flex min-h-10 items-center rounded-lg px-3 hover:underline">
            Terms
          </a>
        </nav>
      </header>
      <main className="mx-auto max-w-[800px] px-5 pb-16 md:px-8">
        <h1 className="mt-4 text-4xl md:text-5xl">{doc.title}</h1>
        <p className="mt-3 text-sm text-[#6b6560]">Last updated: {content.updated}</p>
        <p className="mt-4 text-lg text-[#1a1a1a]">
          <Linked text={doc.intro} />
        </p>
        <div className="mt-8 space-y-8">
          {doc.sections.map((s) => (
            <section key={s.heading}>
              <h2 className="text-2xl">{s.heading}</h2>
              <div className="mt-2 space-y-3 text-base text-[#1a1a1a]">
                {s.body.map((b, i) =>
                  typeof b === "string" ? (
                    <p key={i}>
                      <Linked text={b} />
                    </p>
                  ) : (
                    <ul key={i} className="list-disc space-y-1 pl-6">
                      {b.list.map((li) => (
                        <li key={li}>
                          <Linked text={li} />
                        </li>
                      ))}
                    </ul>
                  ),
                )}
              </div>
            </section>
          ))}
        </div>
      </main>
      <footer className="landing-dark">
        <div className="mx-auto max-w-[800px] px-5 py-8 text-sm text-white/80 md:px-8">
          Repsy Coach · <a href="/" className="underline">Home</a> · <a href="/privacy" className="underline">Privacy</a> ·{" "}
          <a href="/terms" className="underline">Terms</a> ·{" "}
          <a href={`mailto:${content.contactEmail}`} className="underline">
            {content.contactEmail}
          </a>
        </div>
      </footer>
    </div>
  );
}

export function PrivacyPage() {
  return <LegalPage doc={content.privacy as Doc} />;
}

export function TermsPage() {
  return <LegalPage doc={content.terms as Doc} />;
}
