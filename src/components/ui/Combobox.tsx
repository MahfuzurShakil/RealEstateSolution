'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, X } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

export interface ComboboxOption {
  id: string;
  /** what is matched against and shown as the row's first line */
  label: string;
  /** a muted second line — unit, code, category… */
  hint?: string;
  /** extra text that should match a search but is not worth showing */
  keywords?: string;
  disabled?: boolean;
}

/**
 * A `<select>` you can type into.
 *
 * A native select is fine for six options and unusable for two hundred: it has
 * no search, and the only way to reach an item is to know roughly where it sits
 * in the list. The material catalogue is already past that point and only grows,
 * which is what this exists for.
 *
 * It is deliberately not a generic "creatable" control — creating a record is
 * the caller's business (see `MaterialItemPicker`, which keeps its own button).
 *
 * Keyboard: ↓/↑ move, Enter picks, Escape closes without changing anything,
 * Tab leaves and commits nothing that was not already picked. Typing filters;
 * it never invents a value from the typed text, because a half-typed name is
 * not a choice.
 */
export function Combobox({
  value,
  options,
  onChange,
  placeholder = 'Search…',
  emptyLabel = 'Nothing matches',
  disabled,
  invalid,
  allowClear = true,
  className,
  /** shown in place of the label when `value` is set but not in `options` */
  unlistedLabel,
  id,
}: {
  value: string | null;
  options: ComboboxOption[];
  onChange: (id: string | null) => void;
  placeholder?: string;
  emptyLabel?: string;
  disabled?: boolean;
  invalid?: boolean;
  allowClear?: boolean;
  className?: string;
  unlistedLabel?: string | null;
  id?: string;
}) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const listId = `${inputId}-list`;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeRaw, setActive] = useState(0);

  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = options.find((o) => o.id === value) ?? null;
  const selectedLabel = selected?.label ?? (value ? (unlistedLabel ?? '') : '');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    // every whitespace-separated word must appear somewhere, so "cem shah"
    // finds "Cement (Shah Special)" — people type the distinguishing bits, not
    // a prefix
    const words = q.split(/\s+/);
    return options.filter((o) => {
      const haystack = `${o.label} ${o.hint ?? ''} ${o.keywords ?? ''}`.toLowerCase();
      return words.every((w) => haystack.includes(w));
    });
  }, [options, query]);

  /*
   * The highlight is clamped at render rather than corrected by an effect: the
   * list shrinks as the query is typed, and a stored index that outruns it
   * would otherwise take a render to catch up — long enough for Enter to pick
   * nothing.
   */
  const active = Math.min(activeRaw, Math.max(0, filtered.length - 1));

  /* Keep the highlighted row in view when arrowing past the fold. */
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  /* Clicking anywhere else closes without committing the typed text. */
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  /* Opening lands on the current choice rather than at the top of the list. */
  function openPanel() {
    if (open) return;
    setOpen(true);
    const at = options.findIndex((o) => o.id === value);
    setActive(at >= 0 ? at : 0);
  }

  function close() {
    setOpen(false);
    setQuery('');
  }

  function pick(option: ComboboxOption | undefined) {
    if (!option || option.disabled) return;
    onChange(option.id);
    close();
    inputRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) {
        openPanel();
        return;
      }
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((a) => (filtered.length === 0 ? 0 : (a + step + filtered.length) % filtered.length));
      return;
    }
    if (e.key === 'Enter') {
      if (!open) return;
      // only swallow the key when there is something to pick, so Enter still
      // submits a form from a closed control
      e.preventDefault();
      pick(filtered[active]);
      return;
    }
    if (e.key === 'Escape') {
      if (!open) return;
      e.preventDefault();
      e.stopPropagation();
      close();
      return;
    }
    if (e.key === 'Tab') close();
  }

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <div
        className={cn(
          'flex w-full items-center rounded-xl border border-hairline bg-white pr-1 transition-colors',
          'focus-within:border-admin-400 focus-within:ring-2 focus-within:ring-admin-100',
          invalid && 'border-red-300',
          disabled && 'bg-slate-50',
        )}
      >
        <input
          id={inputId}
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={open && filtered[active] ? `${listId}-${active}` : undefined}
          autoComplete="off"
          disabled={disabled}
          className="w-full bg-transparent px-3 py-2.5 text-sm text-ink outline-none placeholder:text-slate-400 disabled:cursor-not-allowed"
          // closed, it reads as the chosen value; open, it is a search box
          value={open ? query : selectedLabel}
          placeholder={selectedLabel ? '' : placeholder}
          onChange={(e) => {
            setQuery(e.target.value);
            // a new query is a new list; the old highlight means nothing in it
            setActive(0);
            setOpen(true);
          }}
          onFocus={openPanel}
          onClick={openPanel}
          onKeyDown={onKeyDown}
        />

        {allowClear && value && !disabled && (
          <button
            type="button"
            aria-label="Clear the selection"
            className="rounded-lg p-1 text-ink-muted transition-colors hover:bg-slate-100 hover:text-ink"
            // mousedown would blur the input and close the panel first
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onChange(null);
              setQuery('');
              inputRef.current?.focus();
            }}
          >
            <X className="size-4" />
          </button>
        )}
        <ChevronDown
          className={cn(
            'mx-1 size-4 shrink-0 text-ink-muted transition-transform',
            open && 'rotate-180',
          )}
        />
      </div>

      {open && !disabled && (
        <ul
          id={listId}
          ref={listRef}
          role="listbox"
          className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-hairline bg-white py-1 shadow-lg"
        >
          {filtered.length === 0 && (
            <li className="px-3 py-2.5 text-sm text-ink-muted">{emptyLabel}</li>
          )}
          {filtered.map((option, index) => (
            <li
              key={option.id}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={option.id === value}
              data-active={index === active}
              className={cn(
                'flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-ink',
                index === active && 'bg-admin-50',
                option.disabled && 'cursor-not-allowed opacity-50',
              )}
              // a click inside a <label> would otherwise focus-toggle the input
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(index)}
              onClick={() => pick(option)}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate">{option.label}</span>
                {option.hint && (
                  <span className="block truncate text-xs text-ink-muted">{option.hint}</span>
                )}
              </span>
              {option.id === value && <Check className="size-4 shrink-0 text-admin-600" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
