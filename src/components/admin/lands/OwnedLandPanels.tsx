'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useLiveQuery } from 'dexie-react-hooks';
import { Check, FileWarning, KeyRound, Upload } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import type { AcquisitionType, Land } from '@/lib/db/types';
import { ACQUISITION_TYPE_LABEL } from '@/lib/domain/land';
import { useMockSession } from '@/lib/auth/mock-session';
import {
  documentRepository,
  landDevelopmentRepository,
  landProjectMappingRepository,
  landStatusEventRepository,
} from '@/lib/repositories';
import { formatDate } from '@/lib/utils/format';

/**
 * Owned land (LAND-OWNED-FLOW-PLAN.md §3). Nothing is being bought, so the
 * acquisition steps give way to the two questions that matter for land the
 * company already holds: are the ownership papers in order, and is the ground
 * ready for a project.
 */

interface Paper {
  type: string;
  label: string;
  why: string;
}

/** The papers a Bangladeshi title rests on, by how the land came to us. */
export function ownershipPapers(type: AcquisitionType): Paper[] {
  const common: Paper[] = [
    { type: 'khatian_copy', label: 'Khatian (CS / SA / RS / BS)', why: 'The record of rights in the owner’s name' },
    { type: 'mutation_certificate', label: 'Namjari (mutation) & DCR', why: 'The land office has the current owner on record' },
    { type: 'tax_receipt', label: 'Khajna (land tax) receipt', why: 'Tax paid up to the current year' },
  ];
  if (type === 'inherited') {
    return [
      { type: 'succession_certificate', label: 'Warishan (succession) certificate', why: 'Who the heirs are, and their shares' },
      ...common,
      { type: 'dolil_deed', label: 'Original deed (in the ancestor’s name)', why: 'How the family came to own it' },
    ];
  }
  if (type === 'joint_venture') {
    return [
      { type: 'jv_agreement', label: 'Registered JV agreement', why: 'The split and the obligations of both sides' },
      { type: 'power_of_attorney', label: 'Power of attorney', why: 'Lets the company deal with RAJUK and buyers' },
      { type: 'dolil_deed', label: 'Landowner’s title deed', why: 'The land the JV stands on is theirs' },
      ...common,
    ];
  }
  return [{ type: 'dolil_deed', label: 'Registered deed (dolil)', why: 'The sale to the company' }, ...common];
}

/** Which papers are on file, from the land's documents. */
export function usePapersOnFile(land: Land) {
  return useLiveQuery(async () => {
    const docs = await documentRepository.listForEntity('land', land.id);
    const have = new Set(docs.map((d) => d.document_type));
    const papers = ownershipPapers(land.acquisition_type);
    return { papers, have, onFile: papers.filter((p) => have.has(p.type)).length };
  }, [land.id, land.acquisition_type]);
}

export function LandPapersPanel({ land, readOnly }: { land: Land; readOnly?: boolean }) {
  const state = usePapersOnFile(land);
  const { userId } = useMockSession();
  const input = useRef<HTMLInputElement>(null);
  const [uploadingFor, setUploadingFor] = useState<Paper | null>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File, paper: Paper) {
    setBusy(true);
    try {
      await documentRepository.create({
        entity_type: 'land',
        entity_id: land.id,
        document_type: paper.type,
        custom_type_name: null,
        file_url: file.name,
        file_data: file,
        file_name: file.name,
        file_size: file.size,
        mime_type: file.type,
        is_public: false,
        uploaded_by: userId ?? null,
        uploaded_at: new Date().toISOString(),
        notes: `Ownership paper: ${paper.label}`,
      });
    } finally {
      setBusy(false);
      setUploadingFor(null);
    }
  }

  if (!state) return <p className="text-sm text-ink-muted">Loading…</p>;
  return (
    <Card>
      <CardHeader
        title="Ownership papers"
        subtitle={`${state.onFile} of ${state.papers.length} on file · ${ACQUISITION_TYPE_LABEL[land.acquisition_type]}`}
      />
      <input
        ref={input}
        type="file"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f && uploadingFor) void upload(f, uploadingFor);
          e.target.value = '';
        }}
      />
      <ul className="divide-y divide-hairline">
        {state.papers.map((p) => {
          const ok = state.have.has(p.type);
          return (
            <li key={p.type} className="flex items-center gap-3 py-3">
              <span
                className={
                  ok
                    ? 'grid size-8 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-600'
                    : 'grid size-8 shrink-0 place-items-center rounded-lg bg-amber-50 text-amber-600'
                }
              >
                {ok ? <Check className="size-4" /> : <FileWarning className="size-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">{p.label}</p>
                <p className="text-xs text-ink-muted">{p.why}</p>
              </div>
              {ok ? (
                <Badge tone="green">On file</Badge>
              ) : (
                <>
                  <Badge tone="amber">Missing</Badge>
                  {!readOnly && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => {
                        setUploadingFor(p);
                        input.current?.click();
                      }}
                    >
                      <Upload className="size-4" /> Upload
                    </Button>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs text-ink-muted">
        Uploads are filed on the Documents tab under the paper&apos;s type. A missing namjari or warishan
        certificate is the usual reason a bank or RAJUK file is held up.
      </p>
    </Card>
  );
}

/** Sidebar card for an owned land, in place of the acquisition progress. */
export function OwnedLandCard({ land, onOpen }: { land: Land; onOpen: (tab: 'papers' | 'development') => void }) {
  const papers = usePapersOnFile(land);
  const dev = useLiveQuery(() => landDevelopmentRepository.readinessForLand(land.id), [land.id]);
  const projects = useLiveQuery(() => landProjectMappingRepository.projectsForLand(land.id), [land.id]);
  const deedRef = useLiveQuery(async () => {
    const events = await landStatusEventRepository.listForLand(land.id);
    return events.find((e) => e.source === 'owned_entry')?.reference_no ?? null;
  }, [land.id]);
  const how =
    land.acquisition_type === 'inherited'
      ? 'Inherited / family land'
      : land.acquisition_type === 'joint_venture'
        ? 'JV already signed'
        : 'Bought before this system';

  const rows: [string, React.ReactNode][] = [
    ['How', how],
    [land.acquisition_type === 'joint_venture' ? 'JV signed on' : 'Owned since', formatDate(land.acquired_on)],
    ...(deedRef ? ([[land.acquisition_type === 'joint_venture' ? 'Agreement no.' : 'Deed no.', deedRef]] as [string, string][]) : []),
    [
      'Papers',
      papers ? (
        <button type="button" className="font-medium text-admin-700 hover:underline" onClick={() => onOpen('papers')}>
          {papers.onFile} of {papers.papers.length} on file
        </button>
      ) : (
        '…'
      ),
    ],
    [
      'Development',
      dev ? (
        <button type="button" className="font-medium text-admin-700 hover:underline" onClick={() => onOpen('development')}>
          {dev.total === 0 ? 'Nothing recorded' : `${dev.completed ?? 0} of ${dev.total} done`}
        </button>
      ) : (
        '…'
      ),
    ],
    [
      'Project',
      projects && projects.length > 0 ? (
        <span className="flex flex-wrap justify-end gap-1">
          {projects.map((p) => (
            <Link key={p.id} href={`/admin/projects/${p.id}`} className="font-medium text-admin-700 hover:underline">
              {p.code}
            </Link>
          ))}
        </span>
      ) : (
        'Not in a project yet'
      ),
    ],
  ];

  return (
    <Card>
      <CardHeader
        title="Owned land"
        action={
          <span className="grid size-8 place-items-center rounded-lg bg-admin-50 text-admin-600">
            <KeyRound className="size-4" />
          </span>
        }
      />
      <dl className="space-y-2">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-start justify-between gap-3 text-sm">
            <dt className="text-ink-muted">{k}</dt>
            <dd className="text-right text-ink">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-ink-muted">
        Entered as already owned, so site visit, due diligence and negotiation do not apply.
      </p>
    </Card>
  );
}
