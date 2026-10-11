'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

/**
 * A second row of tabs inside a page tab (client feedback 2026-10-11): one
 * section at a time instead of a long column of cards. Actions that apply to
 * the whole tab sit on the right, at the top, where they are seen first.
 */
export function SubTabs<K extends string>({
  tabs,
  active,
  onChange,
  actions,
}: {
  tabs: { key: K; label: string }[];
  active: K;
  onChange: (key: K) => void;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap gap-1 border-b border-hairline">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              active === t.key
                ? 'border-admin-500 text-admin-700'
                : 'border-transparent text-ink-muted hover:text-ink',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
