import type { Client } from "./types";

/** First letters of the first and last name, uppercase ("Maya Patel" -> "MP"). */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

type Props = {
  clients: Client[];
  selectedClientId: string | null;
  onSelect: (clientId: string) => void;
};

// Horizontal, scrollable row of client chips. Shown at the top of the AI Coach,
// Manual Planner and Progress tabs (not the Clients tab, which is the full list).
export function ClientStrip({ clients, selectedClientId, onSelect }: Props) {
  if (clients.length === 0) {
    return <p className="mb-5 text-sm text-dim">No clients yet</p>;
  }

  return (
    <div
      role="group"
      aria-label="Select client"
      className="-mx-1 mb-5 flex flex-nowrap gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]"
    >
      {clients.map((client) => {
        const isActive = client.id === selectedClientId;
        return (
          <button
            key={client.id}
            type="button"
            aria-pressed={isActive}
            onClick={() => onSelect(client.id)}
            className={
              "flex shrink-0 items-center gap-2.5 rounded-full border-2 bg-surface py-1.5 pl-1.5 pr-4 text-left " +
              (isActive ? "border-accent" : "border-border hover:border-dim")
            }
          >
            <span
              aria-hidden="true"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface2 text-sm font-bold text-text"
            >
              {initials(client.name)}
            </span>
            <span className="leading-tight">
              <span className="block whitespace-nowrap text-sm font-semibold text-text">{firstName(client.name)}</span>
              <span className="block whitespace-nowrap text-xs text-dim">{client.goal}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
