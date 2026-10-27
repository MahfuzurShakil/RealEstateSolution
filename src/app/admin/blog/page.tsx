'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronRight, ExternalLink, Newspaper, Plus } from 'lucide-react';
import { BlogPostModal } from '@/components/admin/website/BlogPostModal';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { useMockSession } from '@/lib/auth/mock-session';
import { blogRepository } from '@/lib/repositories';
import { formatDate, todayLocal } from '@/lib/utils/format';

/**
 * Blog (Public Portal v2.0 §2.3, W9): the list and the "New post" popup.
 * Each post opens its own page for pictures, publishing and deleting.
 */
export default function BlogAdminPage() {
  const { userId } = useMockSession();
  const router = useRouter();
  const posts = useLiveQuery(() => blogRepository.list(), []);
  const [creating, setCreating] = useState(false);
  const today = todayLocal();

  return (
    <>
      <PageHeader
        title="Blog"
        subtitle="News and articles for the public website. Drafts stay here until published."
        action={
          <div className="flex items-center gap-3">
            <a href="/blog" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-admin-700 hover:underline">
              View blog <ExternalLink className="size-4" />
            </a>
            <Button onClick={() => setCreating(true)}>
              <Plus className="size-4" /> New post
            </Button>
          </div>
        }
      />

      {posts === undefined ? (
        <p className="text-sm text-ink-muted">Loading…</p>
      ) : posts.length === 0 ? (
        <EmptyState icon={Newspaper} title="No posts yet" description="Write about a handover, a new project or what buyers should check — the home page shows the latest three." />
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-hairline">
            {posts.map((p) => {
              const scheduled = p.status === 'published' && !!p.published_at && p.published_at > today;
              return (
                <li key={p.id}>
                  <Link href={`/admin/blog/${p.id}`} className="flex items-center gap-4 px-4 py-3 hover:bg-slate-50">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{p.title}</p>
                      <p className="truncate text-xs text-ink-muted">
                        /blog/{p.slug} · {p.published_at ? formatDate(p.published_at) : `edited ${formatDate(p.updated_at)}`}
                      </p>
                    </div>
                    <Badge tone={p.status === 'draft' ? 'neutral' : scheduled ? 'amber' : 'green'}>
                      {p.status === 'draft' ? 'Draft' : scheduled ? 'Scheduled' : 'Published'}
                    </Badge>
                    <ChevronRight className="size-4 text-ink-muted" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <BlogPostModal open={creating} userId={userId} onClose={() => setCreating(false)} onSaved={(p) => router.push(`/admin/blog/${p.id}`)} />
    </>
  );
}
