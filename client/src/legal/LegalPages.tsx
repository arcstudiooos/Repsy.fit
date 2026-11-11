// Privacy and Terms (Prompt 73). DRAFTS, written as a structure for the owner's lawyer to complete:
// what data, why, who sees it, how to delete it. Every page says so at the top and in the footer.
// Nothing here is a final legal claim, and nothing promises a guarantee the app cannot keep.
import { useEffect } from "react";
import "../landing/landing.css";

const UPDATED = "12 November 2026";

function Page({ title, intro, children }: { title: string; intro: string; children: React.ReactNode }) {
  useEffect(() => {
    document.title = `${title} - Repsy Coach`;
  }, [title]);
  return (
    <div className="landing-root landing-light min-h-dvh">
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
        {/* The draft label is deliberately the first thing on the page, not only in the footer. */}
        <p role="note" className="rounded-lg border border-[#d8d2c6] bg-[#f1ede6] p-4 text-sm">
          <strong>Draft for legal review.</strong> This page is a working outline, not a final legal document, and
          not legal advice. The owner of Repsy Coach must have a qualified lawyer complete and approve it before
          relying on it.
        </p>
        <h1 className="mt-8 text-4xl md:text-5xl" style={{ fontFamily: "var(--font-serif)" }}>
          {title}
        </h1>
        <p className="landing-dim mt-3 text-lg">{intro}</p>
        <p className="landing-dim mt-1 text-sm">Last updated: {UPDATED}</p>
        <div className="mt-8 space-y-8">{children}</div>
      </main>
      <footer className="landing-dark">
        <div className="mx-auto max-w-[800px] px-5 py-8 text-sm md:px-8">
          <p className="text-white/80">
            <strong>Draft, pending legal review.</strong> Not a final legal document and not legal advice.
          </p>
          <p className="mt-2 text-white/60">
            Repsy Coach · <a href="/" className="underline">Home</a> ·{" "}
            <a href="/privacy" className="underline">Privacy</a> · <a href="/terms" className="underline">Terms</a>
          </p>
        </div>
      </footer>
    </div>
  );
}

function Section({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-2xl" style={{ fontFamily: "var(--font-serif)" }}>
        {heading}
      </h2>
      <div className="landing-dim mt-2 space-y-3 text-base">{children}</div>
    </section>
  );
}

/** Marks a gap the owner's lawyer must fill, so a placeholder can never read as a settled promise. */
function ToComplete({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-[#c9c2b4] bg-white/60 p-3 text-sm">
      <strong>To complete:</strong> {children}
    </p>
  );
}

export function PrivacyPage() {
  return (
    <Page
      title="Privacy"
      intro="What Repsy Coach stores, why it stores it, who can see it, and how to get it deleted."
    >
      <Section heading="Who this is about">
        <p>
          Repsy Coach is used by two kinds of people: a <strong>coach</strong>, who signs up and runs their own
          business in the app, and that coach's <strong>clients</strong>, who may be invited to sign in and see their
          own plan. A coach decides what client information to put into the app; Repsy Coach stores it on their
          behalf.
        </p>
        <ToComplete>
          the legal names and roles of the operator (who is the data controller, and who is a processor), the
          operator's contact address, and whether a data protection officer or representative is required.
        </ToComplete>
      </Section>

      <Section heading="What data is stored">
        <p>Coach account: name, email address, a one-way hash of the password (never the password itself), and the currency setting.</p>
        <p>
          Client records the coach enters: name, and optionally goal, age, height, weight, training level, focus and
          the coach's own notes.
        </p>
        <p>
          Training and tracking records: assignments and templates, progress logs, measurements, daily check-ins,
          habits and habit ticks, progress photos the coach uploads, and appointments.
        </p>
        <p>Messages between a coach and a client, and the coach's chats with the in-app AI assistant.</p>
        <p>Business records the coach enters by hand: plans, prices and recorded payments. No card or bank details are collected or stored, because the app does not take payments.</p>
        <p>Client sign-in: an email address for the invited client and a one-way hash of their password, if they set one.</p>
        <p>Sign-up enquiries from the public site: name and email address.</p>
        <p>Technical records needed to run the service: a signed session cookie, and server logs.</p>
        <ToComplete>
          confirm this list against the live database before publishing, and state the retention period for each
          group, including server logs and backups.
        </ToComplete>
      </Section>

      <Section heading="Why it is stored">
        <p>To provide the service the coach signed up for: keeping their client records, plans and schedule, and showing a client their own plan.</p>
        <p>To sign people in securely and keep them signed in.</p>
        <p>To answer a sign-up enquiry from the public site.</p>
        <p>
          The AI assistant is used only when a coach asks for a suggestion. Suggestions are drafts for the coach to
          approve; nothing is sent to a client automatically.
        </p>
        <ToComplete>
          the lawful basis for each purpose under the law that applies (for example contract, legitimate interests or
          consent), and the name of the AI provider, what is sent to it, and where it processes data.
        </ToComplete>
      </Section>

      <Section heading="Who can see it">
        <p>
          A coach can see only their own clients and their own records. Coaches cannot see each other's data; the app
          filters every request by the signed-in account.
        </p>
        <p>
          A signed-in client can see only their own plan, sessions, messages and streaks. Clients are never shown
          another client's data, and never the coach's ranking of clients or the coach's private notes.
        </p>
        <p>The people who operate Repsy Coach may access data where they need to in order to run or fix the service.</p>
        <ToComplete>
          list the third parties actually used and what each receives: the hosting provider, the database host, the
          email sender, the file storage provider and the AI provider, with the country each operates in and the
          agreement in place.
        </ToComplete>
      </Section>

      <Section heading="How to get data deleted">
        <p>
          A coach can delete a single client from the Clients tab. That removes the client and their records,
          including photos, messages, check-ins, habits, measurements, plans and payments.
        </p>
        <p>
          A coach can delete their whole account from Account settings. That removes the coach, every client they
          added, and all the records above, including uploaded photo files. It cannot be undone.
        </p>
        <p>
          A client who wants their data removed should ask their coach, who can delete it. A client can also contact
          the operator directly.
        </p>
        <ToComplete>
          the contact route for a deletion or access request, how quickly it is answered, how long backups keep a copy
          after deletion, and the other rights that apply (access, correction, portability, objection, complaint to a
          regulator).
        </ToComplete>
      </Section>

      <Section heading="Security">
        <p>
          Passwords are stored only as one-way hashes. Invite links and password-reset links are stored only as
          hashes, expire, and work once. Traffic to the app is encrypted in transit.
        </p>
        <p>No security measure is perfect, and this page does not promise that a breach can never happen.</p>
        <ToComplete>
          the breach notification commitment and timeline, and any certification or audit claim — only if it is
          actually true.
        </ToComplete>
      </Section>

      <Section heading="Children">
        <ToComplete>
          the minimum age for a coach account, and the rule for a coach entering records about a client who is a
          minor, including what consent the coach must obtain.
        </ToComplete>
      </Section>

      <Section heading="Changes to this page">
        <p>If this page changes, the date at the top changes with it.</p>
      </Section>
    </Page>
  );
}

export function TermsPage() {
  return (
    <Page title="Terms" intro="The rules for using Repsy Coach, written plainly and still to be completed by a lawyer.">
      <Section heading="What Repsy Coach is">
        <p>
          Repsy Coach is a tool for a coach to organise their own coaching business: client records, programmes,
          progress tracking, scheduling, and a record of plans and payments they have been paid.
        </p>
        <p>
          It is not a payment service. It does not charge anyone, send payment links or reminders, or produce
          invoices. Payment entries are a record the coach types in themselves.
        </p>
        <p>
          It does not give medical, dietary, legal or financial advice. The AI assistant produces drafts for the
          coach to review; the coach decides what their client is told to do.
        </p>
      </Section>

      <Section heading="Your account">
        <p>A coach is responsible for keeping their password private and for what happens under their account.</p>
        <p>
          A coach must only enter real information about a client where they have that person's permission to store
          it, and must tell their client what is held about them.
        </p>
        <p>The app may not be used to store data a coach has no right to hold, or for anything unlawful.</p>
      </Section>

      <Section heading="Client access">
        <p>
          A client only gets access when their coach invites them. A client sees their own plan, sessions, messages
          and streaks, and nothing belonging to anyone else.
        </p>
        <p>A coach can end a client's access at any time.</p>
      </Section>

      <Section heading="Your data and ending your account">
        <p>
          The records a coach enters remain theirs. A coach can export their data as CSV files from Reports at any
          time, and can delete a single client, or their whole account, from inside the app.
        </p>
        <p>Deleting an account removes the coach's data permanently and cannot be undone.</p>
        <ToComplete>
          what happens to data after an account is closed for non-payment or a rule breach, and the notice given
          before the operator closes an account.
        </ToComplete>
      </Section>

      <Section heading="Availability">
        <p>
          The service is provided as it is, and may be unavailable at times, for example during maintenance or a
          hosting failure. A coach should keep their own export if they need a copy they control.
        </p>
      </Section>

      <Section heading="Paid plans">
        <ToComplete>
          the price, billing period, renewal and cancellation terms, refund policy and tax treatment — only once
          charging actually exists. The app does not take payments today.
        </ToComplete>
      </Section>

      <Section heading="Liability and the rest">
        <ToComplete>
          the limitation of liability, warranty disclaimer, indemnity, governing law, dispute process and the notice
          period for changing these terms. These must be drafted by a lawyer for the country the business operates
          in; nothing is claimed here in the meantime.
        </ToComplete>
      </Section>

      <Section heading="Contact">
        <ToComplete>the operator's legal name, registered address and a contact email address.</ToComplete>
      </Section>
    </Page>
  );
}
