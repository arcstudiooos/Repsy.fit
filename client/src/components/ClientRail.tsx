import { useMemo, useState } from "react";
import type { Client } from "../types";

/**
 * The client rail: the roster, kept on screen beside the client being worked on (Nov 2026).
 *
 * Before this, opening a client REPLACED the roster, which is why the workspace needed a
 * "← Back to all clients" link and a "Switch client" dropdown — two controls that only existed to
 * undo a navigation the layout forced. The old shell was capped at 1100px, so there was genuinely
 * nowhere to put this; widening the canvas is what made it possible.
 *
 * Desktop only by design. On a phone there is no room for two panes, so the roster stays a separate
 * screen with the back link — the same information, one pane at a time.
 */
export function ClientRail({
  clients,
  selectedId,
  onSelect,
  onShowAll,
}: {
  clients: Client[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Back to the full roster grid, which holds what the rail cannot: add, invite, delete. */
  onShowAll: () => void;
}) {
  const [query, setQuery] = useState("");

  // A search box only earns its space once scanning gets hard; below that it is one more control
  // between the coach and the names.
  const searchable = clients.length > 8;
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!searchable || needle === "") return clients;
    return clients.filter((c) => c.name.toLowerCase().includes(needle));
  }, [clients, query, searchable]);

  return (
    <nav aria-label="Clients" className="flex h-full flex-col">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold tracking-wide text-dim uppercase">Clients</h3>
        <span className="font-mono text-xs tabular-nums text-muted">{clients.length}</span>
      </div>

      {/* The rail lists clients; it cannot add, invite or delete one. Without this the roster grid
          that does is unreachable on desktop, because the back link is a phone-only control. */}
      <button
        type="button"
        onClick={onShowAll}
        className="mb-2 min-h-10 rounded-lg px-2 py-1.5 text-left text-sm font-semibold text-accent-text hover:bg-surface2"
      >
        All clients
      </button>

      {searchable && (
        <>
          <label htmlFor="client-rail-search" className="sr-only">
            Search clients
          </label>
          <input
            id="client-rail-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
            autoComplete="off"
            className="mb-2 min-h-10 w-full rounded-lg border border-border-strong bg-surface2 px-3 text-sm text-text placeholder:text-dim"
          />
        </>
      )}

      {/* Scrolls on its own so a long roster never pushes the client's own work down the page. */}
      <ul className="-mx-1 flex-1 overflow-y-auto px-1">
        {shown.length === 0 ? (
          <li className="empty-state px-2 py-3 text-sm">No client matches "{query.trim()}".</li>
        ) : (
          shown.map((c) => {
            const selected = c.id === selectedId;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  // aria-current, not aria-selected: this is navigation, not a tab list.
                  aria-current={selected ? "true" : undefined}
                  onClick={() => onSelect(c.id)}
                  className={
                    "min-h-10 w-full truncate rounded-lg px-2 py-2 text-left text-sm " +
                    (selected
                      ? "bg-accent2/12 font-semibold text-text"
                      : "text-dim hover:bg-surface2 hover:text-text")
                  }
                >
                  {c.name}
                </button>
              </li>
            );
          })
        )}
      </ul>
    </nav>
  );
}
