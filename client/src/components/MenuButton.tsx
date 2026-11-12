import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export type MenuItem = {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
};

type Props = {
  /** Accessible name of the trigger, e.g. "More actions for Squat day". */
  label: string;
  /** What the trigger shows (an icon, initials...). Defaults to "⋯". */
  children?: ReactNode;
  items: MenuItem[];
  /** Optional non-interactive top line inside the menu (e.g. the coach's name). */
  header?: ReactNode;
  buttonClassName?: string;
  title?: string;
};

/**
 * A small dropdown menu (WAI-ARIA menu button): the trigger has aria-haspopup / aria-expanded,
 * opening moves focus to the first item, arrow keys / Home / End move between items, Escape or
 * Tab closes, and a click outside closes. Picking an item gives focus back to the trigger first,
 * so a confirm box opened by the item hands focus back to a button that still exists.
 */
export function MenuButton({ label, children = "⋯", items, header, buttonClassName, title }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    itemRefs.current.find((el) => el && !el.disabled)?.focus();
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) buttonRef.current?.focus();
  };

  const onMenuKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const els = itemRefs.current.filter((el): el is HTMLButtonElement => !!el && !el.disabled);
    const i = els.indexOf(document.activeElement as HTMLButtonElement);
    const move = (to: number) => {
      e.preventDefault();
      els[(to + els.length) % els.length]?.focus();
    };
    if (e.key === "ArrowDown") move(i + 1);
    else if (e.key === "ArrowUp") move(i - 1);
    else if (e.key === "Home") move(0);
    else if (e.key === "End") move(els.length - 1);
    else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close(true);
    } else if (e.key === "Tab") close(false);
  };

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        title={title ?? label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={
          buttonClassName ??
          "inline-flex h-10 w-10 items-center justify-center rounded-lg text-lg font-bold leading-none text-dim hover:bg-surface2 hover:text-text"
        }
      >
        {children}
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKey}
          className="absolute right-0 top-full z-30 mt-1 min-w-44 rounded-lg border border-border bg-surface py-1 text-left text-text shadow-sm"
        >
          {header && <div className="border-b border-border px-3 pb-2 pt-1 text-sm">{header}</div>}
          {items.map((item, i) => (
            <button
              key={item.label}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              type="button"
              role="menuitem"
              tabIndex={-1}
              disabled={item.disabled}
              onClick={() => {
                close(true);
                item.onSelect();
              }}
              className="flex min-h-10 w-full items-center whitespace-nowrap px-3 text-sm font-semibold text-text hover:bg-surface2 focus:bg-surface2 focus:outline-none disabled:opacity-60"
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
