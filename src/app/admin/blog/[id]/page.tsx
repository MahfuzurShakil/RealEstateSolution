'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, ExternalLink, Eye, EyeOff, Pencil, Trash2 } from 'lucide-react';
import { DocumentsPanel } from '@/components/admin/documents/DocumentsPanel';
import { BlogPostModal } from '@/components/admin/website/BlogPostModal';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { PageHeader } from '@/components/ui/PageHeader';
import { useMockSession } from '@/lib/auth/mock-session';
import { blogRepository, documentRepository } from '@/lib/repositories';
import { formatDate, todayLocal } from '@/lib/utils/format';

/**
 * One blog post: the text as it will read, its pictures (documents with
 * `entity_type = 'blog_post'`), and publish / edit / delete.
 */
export default function BlogPostPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { userId } = useMockSession();
  // null once looked up and missing, so a deleted post does not sit on "Loading…"
  const post = useLiveQuery(async () => (await blogRepository.getById(id)) ?? null, [id]);
  const docs = useLiveQuery(() => documentRepository.listForEntity('blog_post', id), [id]);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (post === undefined) return <p className="text-sm text-ink-muted">Loading…</p>;
  if (post === null) {
    return (
      <div className="py-16 text-center">
        <p className="text-ink">This post no longer exists.</p>
        <Link href="/admin/blog" className="mt-3 inline-block text-sm font-medium text-admin-700 hover:underline">
          Back to the blog
        </Link>
      </div>
    );
  }

  const published = post.status === 'published';
  const scheduled = published && !!post.published_at && post.published_at > todayLocal();
  const cover = (docs ?? []).find((d) => d.document_type === 'cover_image');

  return (
    <>
      <Link href="/admin/blog" className="mb-3 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Blog
      </Link>
      <PageHeader
        title={post.title}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            <Badge tone={!published ? 'neutral' : scheduled ? 'amber' : 'green'}>{!published ? 'Draft' : scheduled ? 'Scheduled' : 'Published'}</Badge>
            <span>
              /blog/{post.slug}
              {post.published_at ? ` · ${formatDate(post.published_at)}` : ''}
            </span>
          </span>
        }
        action={
          <div className="flex flex-wrap gap-2">
            {published && !scheduled && (
              <a
                href={`/blog/${post.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-hairline px-3 text-sm font-medium text-ink hover:bg-slate-50"
              >
                View <ExternalLink className="size-4" />
              </a>
            )}
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Pencil className="size-4" /> Edit
            </Button>
            <Button variant="outline" size="sm" onClick={() => blogRepository.setStatus(post.id, published ? 'draft' : 'published')}>
              {published ? <EyeOff className="size-4" /> : <Eye className="size-4" />} {published ? 'Unpublish' : 'Publish'}
            </Button>
            <Button variant="dangerGhost" size="sm" onClick={() => setDeleting(true)}>
              <Trash2 className="size-4" /> Delete
            </Button>
          </div>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader title="Post" subtitle={post.excerpt} />
          <div className="space-y-3 text-sm leading-relaxed text-ink">
            {post.content
              .split(/\n\s*\n/)
              .filter((p) => p.trim())
              .map((p, i) => (
                <p key={i} className="whitespace-pre-line">
                  {p.trim()}
                </p>
              ))}
          </div>
        </Card>
        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader title="Pictures" />
            <p className="mb-3 text-xs text-ink-muted">
              Upload a <span className="font-medium text-ink">Cover image</span> for the blog list and the top of the post;
              any <span className="font-medium text-ink">Content image</span> is shown after the text. Tick “Show on website” on each
              picture — nothing reaches the site without it.
            </p>
            {!cover && <p className="mb-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">No cover yet: the website shows a stock photo instead.</p>}
            <DocumentsPanel entityType="blog_post" entityId={post.id} />
          </Card>
        </div>
      </div>

      <BlogPostModal open={editing} post={post} userId={userId} onClose={() => setEditing(false)} />
      <ConfirmDialog
        open={deleting}
        title="Delete post"
        subtitle={post.title}
        message="The post and its pictures are deleted. To take it off the website but keep it, unpublish it instead."
        confirmLabel="Delete post"
        onConfirm={async () => {
          await blogRepository.removeCascade(post.id);
          router.push('/admin/blog');
        }}
        onCancel={() => setDeleting(false)}
      />
    </>
  );
}
