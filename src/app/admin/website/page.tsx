'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ExternalLink } from 'lucide-react';
import { ContentListEditor, type FieldSpec } from '@/components/admin/website/ContentListEditor';
import { PageHeader } from '@/components/ui/PageHeader';
import { SubTabs } from '@/components/ui/SubTabs';
import { useMockSession } from '@/lib/auth/mock-session';
import { AWARD_KINDS, FAQ_CATEGORIES, type AwardKind, type FaqCategory } from '@/lib/db/types';
import {
  awardRepository,
  faqItemRepository,
  projectRepository,
  teamMemberRepository,
  testimonialRepository,
} from '@/lib/repositories';
import { humanize } from '@/lib/utils/format';

/**
 * Website content (PUBLIC-WEBSITE-MASTER-PLAN.md §10, W7): the four lists the
 * public site shows besides projects. Company text and contact details stay
 * in Settings → Company (Website card); this screen holds the rows.
 */
type Tab = 'testimonials' | 'team' | 'awards' | 'faq';

const TABS: { key: Tab; label: string }[] = [
  { key: 'testimonials', label: 'Testimonials' },
  { key: 'team', label: 'Team' },
  { key: 'awards', label: 'Awards & memberships' },
  { key: 'faq', label: 'FAQ' },
];

const KIND_LABEL: Record<AwardKind, string> = { award: 'Award', certification: 'Certification', membership: 'Membership' };
const FAQ_LABEL: Record<FaqCategory, string> = {
  buying: 'Buying',
  payment: 'Payment',
  papers: 'Papers',
  abroad: 'Buying from abroad',
  other: 'Other',
};

const isWebUrl = (v: string) => !v.trim() || /^https?:\/\//i.test(v.trim());

export default function WebsiteContentPage() {
  const { userId } = useMockSession();
  const [tab, setTab] = useState<Tab>('testimonials');
  const testimonials = useLiveQuery(() => testimonialRepository.listOrdered(), []);
  const team = useLiveQuery(() => teamMemberRepository.listOrdered(), []);
  const awards = useLiveQuery(() => awardRepository.listOrdered(), []);
  const faqs = useLiveQuery(() => faqItemRepository.listOrdered(), []);
  const projects = useLiveQuery(() => projectRepository.list(), []);

  const projectName = (id: unknown) => (projects ?? []).find((p) => p.id === id)?.name ?? null;
  const photoCheck = (v: Record<string, string>): Record<string, string> =>
    isWebUrl(v.photo_url ?? '') ? {} : { photo_url: 'Use a web link starting with https://' };

  const testimonialFields: FieldSpec[] = [
    { key: 'buyer_name', label: 'Buyer name', type: 'text', required: true, half: true },
    { key: 'buyer_detail', label: 'Shown under the name', type: 'text', half: true, placeholder: 'Flat owner, Uttara' },
    { key: 'quote', label: 'What they said', type: 'textarea', required: true },
    {
      key: 'project_id',
      label: 'Project',
      type: 'select',
      half: true,
      hint: 'Linked only while the project is on the website',
      options: [{ value: '', label: '— none —' }, ...(projects ?? []).map((p) => ({ value: p.id, label: p.name }))],
    },
    {
      key: 'rating',
      label: 'Stars',
      type: 'select',
      half: true,
      numeric: true,
      options: [{ value: '', label: 'No stars' }, ...[5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: `${n} star${n === 1 ? '' : 's'}` }))],
    },
    { key: 'photo_url', label: 'Photo link', type: 'text', placeholder: 'https://…', hint: 'Optional. Only with the buyer’s permission.' },
  ];

  const teamFields: FieldSpec[] = [
    { key: 'name', label: 'Name', type: 'text', required: true, half: true },
    { key: 'title', label: 'Title', type: 'text', required: true, half: true, placeholder: 'Managing Director' },
    { key: 'bio', label: 'Short bio', type: 'textarea' },
    { key: 'photo_url', label: 'Photo link', type: 'text', placeholder: 'https://…' },
  ];

  const awardFields: FieldSpec[] = [
    { key: 'kind', label: 'Kind', type: 'select', half: true, defaultValue: 'award', options: AWARD_KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] })) },
    { key: 'year', label: 'Year', type: 'number', half: true, placeholder: '2024' },
    { key: 'title', label: 'Title', type: 'text', required: true, placeholder: 'REHAB Fair Best Project' },
    { key: 'issuer', label: 'Given by', type: 'text', placeholder: 'REHAB' },
  ];

  const faqFields: FieldSpec[] = [
    { key: 'category', label: 'Topic', type: 'select', defaultValue: 'buying', options: FAQ_CATEGORIES.map((c) => ({ value: c, label: FAQ_LABEL[c] })) },
    { key: 'question', label: 'Question', type: 'text', required: true },
    { key: 'answer', label: 'Answer', type: 'textarea', required: true },
  ];

  return (
    <>
      <PageHeader
        title="Website content"
        subtitle="Testimonials, team, awards and questions shown on the public website. Hidden rows stay here for later."
        action={
          <a
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-admin-700 hover:underline"
          >
            View public site <ExternalLink className="size-4" />
          </a>
        }
      />
      <SubTabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === 'testimonials' && (
        <ContentListEditor
          noun="testimonial"
          rows={testimonials as never}
          fields={testimonialFields}
          repo={testimonialRepository as never}
          primary={(r) => `${r.buyer_name}${r.rating ? ` · ${'★'.repeat(Number(r.rating))}` : ''}`}
          secondary={(r) => [projectName(r.project_id), `“${String(r.quote)}”`].filter(Boolean).join(' — ')}
          emptyHint="Add what buyers have said about their flat, plot or the buying experience. The home page shows them once there is at least one."
          validate={photoCheck}
          userId={userId}
        />
      )}
      {tab === 'team' && (
        <ContentListEditor
          noun="team member"
          rows={team as never}
          fields={teamFields}
          repo={teamMemberRepository as never}
          primary={(r) => `${r.name} — ${r.title}`}
          secondary={(r) => (r.bio ? String(r.bio) : null)}
          emptyHint="Directors and key people, shown on the About page."
          validate={photoCheck}
          userId={userId}
        />
      )}
      {tab === 'awards' && (
        <ContentListEditor
          noun="award"
          rows={awards as never}
          fields={awardFields}
          repo={awardRepository as never}
          primary={(r) => String(r.title)}
          secondary={(r) => [KIND_LABEL[r.kind as AwardKind], r.issuer, r.year].filter(Boolean).join(' · ')}
          emptyHint="Awards, certifications and memberships (REHAB, ISO …), shown on the About page."
          validate={(v): Record<string, string> => {
            const y = v.year.trim();
            return y && !(Number.isInteger(Number(y)) && Number(y) >= 1950 && Number(y) <= new Date().getFullYear())
              ? { year: 'Enter a four-digit year.' }
              : {};
          }}
          userId={userId}
        />
      )}
      {tab === 'faq' && (
        <ContentListEditor
          noun="question"
          rows={faqs as never}
          fields={faqFields}
          repo={faqItemRepository as never}
          primary={(r) => String(r.question)}
          secondary={(r) => `${humanize(FAQ_LABEL[r.category as FaqCategory])} — ${String(r.answer)}`}
          emptyHint="While this list is empty, the website shows its built-in buyer questions. Add your own to replace them."
          userId={userId}
        />
      )}
    </>
  );
}
