import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import type { Client } from "./types";

/** First letters of the first and last name, uppercase ("Maya Patel" -> "MP"). */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

type Props = {
  clients: Client[];
  client: Client;
  onSelect: (clientId: string) => void;
};

// One header for every client-scoped view (AI Coach and the client workspace): initials, name, goal
// and a "Switch client" control. Replaced the horizontal chip strip (Nov 2026), which hid most
// clients off-screen once a coach had more than a handful.
export function ClientHeader({ clients, client, onSelect }: Props) {
  return (
    <section
      aria-label="Selected client"
      data-testid="client-header"
      className="mb-5 flex items-center gap-3 rounded-card border border-border bg-surface2 p-3"
    >
      <span
        aria-hidden="true"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface font-bold text-text"
      >
        {initials(client.name)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-text">{client.name}</p>
        <p className="truncate text-sm text-dim">{client.goal}</p>
      </div>
      {clients.length > 1 && <ClientSwitcher clients={clients} selectedId={client.id} onSelect={onSelect} />}
    </section>
  );
}

/** "Switch client" button + a searchable list (combobox + listbox). Works by keyboard and with long lists. */
function ClientSwitcher({ clients, selectedId, onSelect }: { clients: Client[]; selectedId: string; onSelect: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const baseId = useId();
  const listId = `${baseId}-list`;

  const q = query.trim().toLowerCase();
  const matches = q ? clients.filter((c) => c.name.toLowerCase().includes(q) || c.goal.toLowerCase().includes(q)) : clients;
  const optionId = (i: number) => `${baseId}-opt-${i}`;

  function openList() {
    setQuery("");
    setActive(Math.max(0, clients.findIndex((c) => c.id === selectedId)));
    setOpen(true);
  }
  function close(focusButton: boolean) {
    setOpen(false);
    if (focusButton) buttonRef.current?.focus();
  }
  function choose(c: Client) {
    onSelect(c.id);
    close(true);
  }

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Clicking anywhere outside closes the list.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Keep the highlighted option in view while arrowing through a long list.
  useEffect(() => {
    if (open) document.getElementById(optionId(active))?.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, open]);

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(matches.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Home") {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActive(Math.max(0, matches.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const c = matches[active];
      if (c) choose(c);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close(true);
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <div ref={wrapRef} className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? close(false) : openList())}
        className="min-h-10 rounded-lg border border-border bg-surface px-3 text-sm font-semibold text-text hover:border-dim"
      >
        Switch client
      </button>
      {open && (
        <div className="card absolute right-0 top-full z-30 mt-2 w-72 max-w-[calc(100vw-2rem)] p-2 shadow-sm">
          <input
            ref={inputRef}
            type="search"
            role="combobox"
            aria-label="Search clients"
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={matches[active] ? optionId(active) : undefined}
            placeholder="Search by name or goal"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            className="min-h-10 w-full rounded-lg border border-border bg-surface2 px-3 text-sm text-text"
          />
          <ul id={listId} role="listbox" aria-label="Clients" className="mt-2 max-h-72 overflow-y-auto">
            {matches.map((c, i) => (
              <li
                key={c.id}
                id={optionId(i)}
                role="option"
                aria-selected={c.id === selectedId}
                onMouseDown={(e) => e.preventDefault()}
                onMouseMove={() => setActive(i)}
                onClick={() => choose(c)}
                className={
                  "flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 " +
                  (i === active ? "bg-surface2" : "")
                }
              >
                <span
                  aria-hidden="true"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface2 text-xs font-bold text-text"
                >
                  {initials(c.name)}
                </span>
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block truncate text-sm font-semibold text-text">{c.name}</span>
                  <span className="block truncate text-xs text-dim">{c.goal}</span>
                </span>
                {c.id === selectedId && (
                  <span aria-hidden="true" className="text-sm font-bold text-accent2">
                    ✓
                  </span>
                )}
              </li>
            ))}
          </ul>
          {matches.length === 0 && <p className="px-2 py-3 text-sm text-dim">No clients match "{query.trim()}".</p>}
        </div>
      )}
    </div>
  );
}
