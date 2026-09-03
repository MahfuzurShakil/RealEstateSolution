'use client';

import { Menu, PanelLeft } from 'lucide-react';
import { ROLES, useMockSession, type Role } from '@/lib/auth/mock-session';
import { humanize } from '@/lib/utils/format';

/** Design Reference A.2 — logo/collapse and the user chip. */
export function AdminTopbar({
  onToggleSidebar,
  onOpenMenu,
}: {
  onToggleSidebar: () => void;
  onOpenMenu: () => void;
}) {
  const { role, setRole, userName } = useMockSession();
  // the avatar used to read a hardcoded "DU" while the name beside it changed
  // with the role, so the two disagreed about who was signed in
  const initials =
    userName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || '—';

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-4 border-b border-hairline bg-white px-4 lg:px-6">
      {/* below lg the sidebar is a drawer, so the same spot opens it instead */}
      <button
        type="button"
        onClick={onOpenMenu}
        aria-label="Open menu"
        className="grid size-9 shrink-0 place-items-center rounded-lg text-ink-muted hover:bg-admin-50 hover:text-admin-700 lg:hidden"
      >
        <Menu className="size-5" />
      </button>
      <button
        type="button"
        onClick={onToggleSidebar}
        aria-label="Toggle sidebar"
        className="hidden size-9 shrink-0 place-items-center rounded-lg text-ink-muted hover:bg-admin-50 hover:text-admin-700 lg:grid"
      >
        <PanelLeft className="size-5" />
      </button>

      {/*
        * The Design Reference puts a search pill and an icon cluster (bell,
        * messages, calendar, dark mode) here. They were built as decoration —
        * the input had no handler and the four buttons had no `onClick` and no
        * `aria-label` — so on every page the most prominent control did
        * nothing, and a screen reader announced four unnamed buttons.
        *
        * They are gone rather than stubbed. A control that looks live and is
        * not costs more trust than the empty space costs polish. Global search
        * comes back when it can actually search (it is on the plan); a
        * notification bell belongs with the Phase 2 notification module
        * (OPEN-ITEMS 1.6).
        */}

      <div className="ml-auto flex items-center gap-1">
        <div className="flex items-center gap-3">
          <div className="hidden text-right sm:block">
            <p className="text-sm font-medium leading-tight text-ink">{userName}</p>
            {/* Phase A role simulation — no real auth */}
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="cursor-pointer bg-transparent text-xs text-ink-muted outline-none"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {humanize(r)}
                </option>
              ))}
            </select>
          </div>
          <div className="relative">
            <span
              className="grid size-9 place-items-center rounded-full bg-admin-100 text-sm font-semibold text-admin-700"
              aria-hidden
            >
              {initials}
            </span>
            <span className="absolute bottom-0 right-0 size-2.5 rounded-full border-2 border-white bg-emerald-500" />
          </div>
        </div>
      </div>
    </header>
  );
}
