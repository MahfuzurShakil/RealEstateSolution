'use client';

import { EyeOff, Globe } from 'lucide-react';
import type { EntityType } from '@/lib/db/types';
import { documentRepository } from '@/lib/repositories';
import { cn } from '@/lib/utils/cn';

/**
 * Only these records have files the public website reads (project gallery,
 * brochure and plans; site progress photos; blog pictures). Elsewhere the
 * "public" flag would do nothing, so it is not offered.
 */
export const WEBSITE_ENTITIES: EntityType[] = ['project', 'site_progress_update', 'blog_post'];

/**
 * One click puts a file on the website or takes it off (PUBLIC-WEBSITE-MASTER-PLAN
 * §10.2). Before this, `is_public` could only be chosen at upload time.
 */
export function WebsiteToggle({ id, isPublic, className }: { id: string; isPublic: boolean; className?: string }) {
  return (
    <button
      type="button"
      aria-pressed={isPublic}
      title={isPublic ? 'Shown on the public website — click to hide it' : 'Internal only — click to show it on the public website'}
      onClick={(e) => {
        e.stopPropagation();
        void documentRepository.setPublic(id, !isPublic);
      }}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
        isPublic
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
          : 'border-hairline bg-white text-ink-muted hover:border-admin-300 hover:text-admin-700',
        className,
      )}
    >
      {isPublic ? <Globe className="size-3.5" /> : <EyeOff className="size-3.5" />}
      {isPublic ? 'On website' : 'Internal'}
    </button>
  );
}
