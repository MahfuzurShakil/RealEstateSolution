'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { FileText } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Checkbox, Field, SelectInput, TextArea, TextInput } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import type { BlogPost } from '@/lib/db/types';
import { DuplicateSlugError, blogRepository, slugify, userRepository } from '@/lib/repositories';
import { todayLocal } from '@/lib/utils/format';

const EXCERPT_MAX = 240;

/**
 * The blog post popup (Public Portal v2.0 §2.3 — list + popup form). Text
 * only; pictures are documents on the post's own page. The address follows
 * the title until someone edits it by hand.
 */
export function BlogPostModal({
  open,
  post,
  userId,
  onClose,
  onSaved,
}: {
  open: boolean;
  post?: BlogPost;
  userId: string | null;
  onClose: () => void;
  onSaved?: (post: BlogPost) => void;
}) {
  if (!open) return null;
  return <PostForm key={post?.id ?? 'new'} post={post} userId={userId} onClose={onClose} onSaved={onSaved} />;
}

function PostForm({
  post,
  userId,
  onClose,
  onSaved,
}: {
  post?: BlogPost;
  userId: string | null;
  onClose: () => void;
  onSaved?: (post: BlogPost) => void;
}) {
  const users = useLiveQuery(() => userRepository.listActive(), []);
  const [title, setTitle] = useState(post?.title ?? '');
  const [slug, setSlug] = useState(post?.slug ?? '');
  const [slugTouched, setSlugTouched] = useState(Boolean(post));
  const [excerpt, setExcerpt] = useState(post?.excerpt ?? '');
  const [content, setContent] = useState(post?.content ?? '');
  const [authorId, setAuthorId] = useState(post?.author_id ?? userId ?? '');
  const [publish, setPublish] = useState(post ? post.status === 'published' : false);
  const [date, setDate] = useState(post?.published_at ?? todayLocal());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const shownSlug = slugTouched ? slug : slugify(title);

  const save = async () => {
    const e: Record<string, string> = {};
    if (title.trim().length < 3) e.title = 'Give the post a title.';
    if (!slugify(shownSlug)) e.slug = 'The address needs at least one letter or number.';
    if (!excerpt.trim()) e.excerpt = 'A one- or two-line summary is shown on the blog list.';
    else if (excerpt.trim().length > EXCERPT_MAX) e.excerpt = `Keep the summary under ${EXCERPT_MAX} characters.`;
    if (content.trim().length < 20) e.content = 'Write the post before saving.';
    if (publish && !date) e.date = 'Pick the date the post goes out.';
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    try {
      const data = {
        title: title.trim(),
        slug: shownSlug,
        excerpt: excerpt.trim(),
        content: content.trim(),
        author_id: authorId || null,
        status: publish ? ('published' as const) : ('draft' as const),
        published_at: publish ? date : (post?.published_at ?? null),
      };
      const saved = post ? await blogRepository.update(post.id, data) : await blogRepository.create(data, userId);
      if (saved) onSaved?.(saved);
      onClose();
    } catch (err) {
      if (err instanceof DuplicateSlugError) setErrors({ slug: err.message });
      else throw err;
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      size="lg"
      icon={FileText}
      title={post ? 'Edit post' : 'New blog post'}
      subtitle={post ? `/blog/${post.slug}` : 'Pictures are added on the post’s page after saving.'}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? 'Saving…' : publish ? 'Save and publish' : 'Save draft'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Title" required error={errors.title} className="sm:col-span-2">
          <TextInput value={title} onChange={(e) => setTitle(e.target.value)} invalid={Boolean(errors.title)} placeholder="Five papers to check before you book a flat" />
        </Field>
        <Field label="Address" hint={`Shown as /blog/${shownSlug || '…'}`} error={errors.slug} className="sm:col-span-2">
          <TextInput
            value={shownSlug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value);
            }}
            invalid={Boolean(errors.slug)}
          />
        </Field>
        <Field
          label="Summary"
          required
          hint={`${excerpt.trim().length}/${EXCERPT_MAX} — shown on the blog list and when the link is shared`}
          error={errors.excerpt}
          className="sm:col-span-2"
        >
          <TextArea rows={2} value={excerpt} onChange={(e) => setExcerpt(e.target.value)} invalid={Boolean(errors.excerpt)} />
        </Field>
        <Field label="Post" required hint="Plain text. A blank line starts a new paragraph." error={errors.content} className="sm:col-span-2">
          <TextArea rows={12} value={content} onChange={(e) => setContent(e.target.value)} invalid={Boolean(errors.content)} />
        </Field>
        <Field label="Author">
          <SelectInput value={authorId} onChange={(e) => setAuthorId(e.target.value)}>
            <option value="">No author shown</option>
            {(users ?? []).map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Publish date" error={errors.date} hint="A future date keeps it off the site until then">
          <TextInput type="date" value={date ?? ''} onChange={(e) => setDate(e.target.value)} disabled={!publish} invalid={Boolean(errors.date)} />
        </Field>
        <Checkbox className="sm:col-span-2" label="Published — show on the website" checked={publish} onChange={(e) => setPublish(e.target.checked)} />
      </div>
    </Modal>
  );
}
