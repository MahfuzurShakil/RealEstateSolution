'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { ChevronRight, X } from 'lucide-react';
import { useMockSession } from '@/lib/auth/mock-session';
import { canView } from '@/lib/domain/access';
import { cn } from '@/lib/utils/cn';
import { NAV_GROUPS } from './nav-config';

/** '/admin/lands/new' should still light up the '/admin/lands' item. */
function isActiveHref(pathname: string, href: string): boolean {
  return href === '/admin' ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Design Reference A.3 — white sidebar, collapsible groups, teal-tinted active
 * item.
 *
 * One component covers both layouts: from `lg` up it is a sticky column that
 * the topbar can collapse to icons; below `lg` it slides in as an overlay
 * drawer, because there is no room to keep it on screen.
 */
export function AdminSidebar({
  collapsed,
  mobileOpen,
  onClose,
}: {
  collapsed: boolean;
  mobileOpen: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const { role } = useMockSession();

  /*
   * Section 9.6 applied to the menu: a role only sees the modules it can open.
   * Hiding rather than disabling is deliberate — a greyed-out "Users & Roles"
   * tells a site manager the screen exists and that they are not trusted with
   * it, which is noise. `disabled` still means "not built yet", which is a
   * different thing and stays visible.
   */
  const groups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) =>
        (item.module === null || canView(role, item.module)) &&
        (item.visibleFor === undefined || item.visibleFor(role)),
    ),
  })).filter((group) => group.items.length > 0);

  // Only explicit user toggles are stored; a group holding the current page is
  // open by default, so navigation needs no effect to keep the tree in sync.
  const [toggled, setToggled] = useState<Record<string, boolean>>({});

  const toggle = (label: string, isOpen: boolean) =>
    setToggled((prev) => ({ ...prev, [label]: !isOpen }));

  // the icons-only state is a desktop affordance; the drawer always has room
  const showLabels = !collapsed || mobileOpen;

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-[2px] lg:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex h-screen w-72 shrink-0 flex-col border-r border-hairline bg-white transition-transform duration-200',
          'lg:sticky lg:top-0 lg:z-auto lg:translate-x-0 lg:transition-[width]',
          mobileOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full',
          collapsed ? 'lg:w-[76px]' : 'lg:w-64',
        )}
      >
        <div className="flex h-16 items-center gap-2 px-5">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-admin-500 text-sm font-bold text-white">
            RE
          </span>
          {showLabels && (
            <span className="truncate text-base font-semibold text-ink">Developer Suite</span>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="ml-auto grid size-8 shrink-0 place-items-center rounded-lg text-ink-muted hover:bg-admin-50 hover:text-admin-700 lg:hidden"
          >
            <X className="size-4" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-4">
          {groups.map((group) => {
            const Icon = group.icon;
            const groupActive = group.items.some((i) => isActiveHref(pathname, i.href));
            const isOpen = toggled[group.label] ?? groupActive;

            return (
              <div key={group.label} className="mb-1">
                <button
                  type="button"
                  onClick={() => toggle(group.label, isOpen)}
                  title={showLabels ? undefined : group.label}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                    groupActive
                      ? 'bg-admin-50 text-admin-700'
                      : 'text-ink-muted hover:bg-admin-50/70 hover:text-admin-700',
                  )}
                >
                  <Icon className="size-[18px] shrink-0" />
                  {showLabels && (
                    <>
                      <span className="flex-1 text-left">{group.label}</span>
                      <ChevronRight
                        className={cn('size-4 transition-transform', isOpen && 'rotate-90')}
                      />
                    </>
                  )}
                </button>

                {showLabels && isOpen && (
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
                            // tapping a link on mobile should reveal the page, not the drawer
                            onClick={onClose}
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

      </aside>
    </>
  );
}
