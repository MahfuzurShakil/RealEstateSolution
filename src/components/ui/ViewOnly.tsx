'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { Eye } from 'lucide-react';
import { useMockSession } from '@/lib/auth/mock-session';
import { USER_ROLE_META } from '@/lib/domain/access';

/**
 * Section 9.6 inside a page (QA audit 2026-10-11, X-01).
 *
 * The route guard decides who may open a screen; this decides who may act on
 * it. Inside a read-only area the shared `Button` and `Checkbox` disable
 * themselves, so every action in every card and panel is covered without
 * gating each one by hand — including dialogs opened from inside, which
 * inherit the context through their portal. Buttons that only look (view,
 * download, close) pass `viewSafe`. Tab strips and view toggles are plain
 * buttons and keep working, so the records stay readable.
 */
const ReadOnlyContext = createContext(false);

/**
 * The innermost area decides, so a page can be view-only while one action on
 * it is open to a role with a separate right (a director correcting a status).
 */
export function ViewOnlyArea({ readOnly, children }: { readOnly: boolean; children: ReactNode }) {
  return <ReadOnlyContext.Provider value={readOnly}>{children}</ReadOnlyContext.Provider>;
}

export function useReadOnly(): boolean {
  return useContext(ReadOnlyContext);
}

/** One line saying why the actions are greyed out. */
export function ViewOnlyNotice({ what }: { what: string }) {
  const { role } = useMockSession();
  return (
    <p className="mb-4 flex items-center gap-2 rounded-xl border border-hairline bg-slate-50 px-3 py-2 text-xs text-ink-muted">
      <Eye className="size-3.5 shrink-0" />
      View only. {USER_ROLE_META[role].label} can see this {what} but not change it.
    </p>
  );
}
