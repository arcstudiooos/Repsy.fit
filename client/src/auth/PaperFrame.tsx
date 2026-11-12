import type { ReactNode } from "react";

/** The frame every sign-in screen shares with the landing page: cream paper and the "Repsy." wordmark
 *  linking home, whatever the device's light/dark setting. Styles: `.paper` in index.css. */
export function PaperFrame({ children }: { children: ReactNode }) {
  return (
    <div className="paper flex min-h-dvh flex-col">
      <header className="px-4 pt-4 sm:px-6 sm:pt-5">
        <a href="/" className="paper-logo" aria-label="Repsy home">
          Repsy<span className="text-accent">.</span>
        </a>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-10">{children}</main>
    </div>
  );
}
