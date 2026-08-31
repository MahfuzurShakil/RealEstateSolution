'use client';

import { Bell, CalendarDays, MessageSquare, Moon, PanelLeft, Search } from 'lucide-react';
import { ROLES, useMockSession, type Role } from '@/lib/auth/mock-session';
import { humanize } from '@/lib/utils/format';

/** Design Reference A.2 — logo/collapse, pill search, icon cluster, user chip. */
export function AdminTopbar({ onToggleSidebar }: { onToggleSidebar: () => void }) {
  const { role, setRole, userName } = useMockSession();

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-4 border-b border-hairline bg-white px-4 lg:px-6">
      <button
        type="button"
        onClick={onToggleSidebar}
        aria-label="Toggle sidebar"
        className="grid size-9 place-items-center rounded-lg text-ink-muted hover:bg-admin-50 hover:text-admin-700"
      >
        <PanelLeft className="size-5" />
      </button>

      <div className="relative hidden max-w-md flex-1 md:block">
        <Search className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          placeholder="Search anything"
          className="w-full rounded-full bg-slate-100 py-2.5 pl-5 pr-11 text-sm text-ink outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-admin-200"
        />
      </div>

      <div className="ml-auto flex items-center gap-1">
        {[Bell, MessageSquare, CalendarDays, Moon].map((Icon, i) => (
          <button
            key={i}
            type="button"
            className="grid size-9 place-items-center rounded-lg text-ink-muted hover:bg-admin-50 hover:text-admin-700"
          >
            <Icon className="size-[18px]" />
          </button>
        ))}

        <div className="ml-2 flex items-center gap-3 border-l border-hairline pl-3">
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
            <span className="grid size-9 place-items-center rounded-full bg-admin-100 text-sm font-semibold text-admin-700">
              DU
            </span>
            <span className="absolute bottom-0 right-0 size-2.5 rounded-full border-2 border-white bg-emerald-500" />
          </div>
        </div>
      </div>
    </header>
  );
}
