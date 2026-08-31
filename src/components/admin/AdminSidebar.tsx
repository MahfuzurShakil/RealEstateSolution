'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { ChevronRight, LifeBuoy } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { HELP_ITEM, NAV_GROUPS } from './nav-config';

/** Design Reference A.3 — white sidebar, collapsible groups, teal-tinted active item. */
/** '/admin/lands/new' should still light up the '/admin/lands' item. */
function isActiveHref(pathname: string, href: string): boolean {
  return href === '/admin' ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminSidebar({ collapsed }: { collapsed: boolean }) {
  const pathname = usePathname();
  // Only explicit user toggles are stored; a group holding the current page is
  // open by default, so navigation needs no effect to keep the tree in sync.
  const [toggled, setToggled] = useState<Record<string, boolean>>({});

  const toggle = (label: string, isOpen: boolean) =>
    setToggled((prev) => ({ ...prev, [label]: !isOpen }));

  return (
    <aside
      className={cn(
        'sticky top-0 hidden h-screen shrink-0 flex-col border-r border-hairline bg-white transition-[width] duration-200 lg:flex',
        collapsed ? 'w-[76px]' : 'w-64',
      )}
    >
      <div className="flex h-16 items-center gap-2 px-5">
        <span className="grid size-9 place-items-center rounded-xl bg-admin-500 text-sm font-bold text-white">
          RE
        </span>
        {!collapsed && <span className="text-base font-semibold text-ink">Developer Suite</span>}
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        {NAV_GROUPS.map((group) => {
          const Icon = group.icon;
          const groupActive = group.items.some((i) => isActiveHref(pathname, i.href));
          const isOpen = toggled[group.label] ?? groupActive;

          return (
            <div key={group.label} className="mb-1">
              <button
                type="button"
                onClick={() => toggle(group.label, isOpen)}
                title={collapsed ? group.label : undefined}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                  groupActive
                    ? 'bg-admin-50 text-admin-700'
                    : 'text-ink-muted hover:bg-admin-50/70 hover:text-admin-700',
                )}
              >
                <Icon className="size-[18px] shrink-0" />
                {!collapsed && (
                  <>
                    <span className="flex-1 text-left">{group.label}</span>
                    <ChevronRight
                      className={cn('size-4 transition-transform', isOpen && 'rotate-90')}
                    />
                  </>
                )}
              </button>

              {!collapsed && isOpen && (
                <ul className="mt-1 space-y-0.5 pl-11">
                  {group.items.map((item) => {
                    const active = isActiveHref(pathname, item.href);
                    if (item.disabled) {
                      return (
                        <li key={item.href}>
                          <span
                            className="block cursor-not-allowed rounded-lg px-3 py-2 text-sm text-slate-300"
                            title="Not built yet"
                          >
                            {item.label}
                          </span>
                        </li>
                      );
                    }
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          className={cn(
                            'block rounded-lg px-3 py-2 text-sm transition-colors',
                            active
                              ? 'bg-admin-500 font-medium text-white'
                              : 'text-ink-muted hover:bg-admin-50 hover:text-admin-700',
                          )}
                        >
                          {item.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </nav>

      <div className="border-t border-hairline p-3">
        <span
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-ink-muted"
          title={HELP_ITEM.label}
        >
          <LifeBuoy className="size-[18px] shrink-0" />
          {!collapsed && HELP_ITEM.label}
        </span>
      </div>
    </aside>
  );
}
