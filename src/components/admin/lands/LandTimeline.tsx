'use client';

import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Check, CircleDashed, FileImage, FileText, History } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { DocumentViewer } from '@/components/admin/documents/DocumentsPanel';
import type { DocumentRecord, LandStatusEvent } from '@/lib/db/types';
import { LAND_STATUS_META } from '@/lib/domain/land';
import { documentRepository, landStatusEventRepository } from '@/lib/repositories';
import { formatBdt, formatDate } from '@/lib/utils/format';

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="text-sm text-ink">{value}</dd>
    </div>
  );
}

/** Tree-style audit trail of every pipeline step with the details captured. */
export function LandTimeline({ landId }: { landId: string }) {
  const events = useLiveQuery(() => landStatusEventRepository.listForLand(landId), [landId]);
  const [viewing, setViewing] = useState<DocumentRecord | null>(null);

  /*
   * Every document on the land, bucketed by the step it was attached at.
   *
   * Read whole rather than queried per event: `status_event_id` is not indexed
   * (see the note on `DocumentRecord`), and one land's documents are a handful
   * of rows — a query per timeline entry would be more work, not less.
   */
  const documents = useLiveQuery(() => documentRepository.listForEntity('land', landId), [landId]);
  const byEvent = useMemo(() => {
    const map = new Map<string, DocumentRecord[]>();
    for (const doc of documents ?? []) {
      if (!doc.status_event_id) continue;
      const bucket = map.get(doc.status_event_id);
      if (bucket) bucket.push(doc);
      else map.set(doc.status_event_id, [doc]);
    }
    return map;
  }, [documents]);

  if (events === undefined) return <p className="text-sm text-ink-muted">Loading…</p>;

  if (events.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="No pipeline activity yet"
        description="Every status change is logged here with its date, who did it and the remarks recorded at the time."
      />
    );
  }

  return (
    <>
    <ol className="relative space-y-4 pl-8">
      {/* the trunk of the tree */}
      <span className="absolute bottom-3 left-[11px] top-3 w-px bg-hairline" aria-hidden />

      {events.map((event: LandStatusEvent, index) => {
        const meta = LAND_STATUS_META[event.to_status];
        const isLast = index === events.length - 1;
        return (
          <li key={event.id} className="relative">
            <span
              className={`absolute -left-8 top-3 grid size-6 place-items-center rounded-full ring-4 ring-white ${
                isLast ? 'bg-admin-500 text-white' : 'bg-admin-100 text-admin-700'
              }`}
            >
              {isLast ? <CircleDashed className="size-3.5" /> : <Check className="size-3.5" />}
            </span>

            <div className="rounded-xl border border-hairline bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Badge tone={meta.tone}>{meta.label}</Badge>
                  <span className="text-xs text-ink-muted">
                    from {LAND_STATUS_META[event.from_status].label}
                  </span>
                </div>
                <span className="text-xs font-medium text-ink">{formatDate(event.event_date)}</span>
              </div>

              {(event.performed_by || event.amount || event.reference_no) && (
                <dl className="mt-3 grid gap-3 sm:grid-cols-3">
                  {event.performed_by && <Detail label="By" value={event.performed_by} />}
                  {event.amount != null && (
                    <Detail label="Amount" value={formatBdt(event.amount)} />
                  )}
                  {event.reference_no && (
                    <Detail label="Reference" value={event.reference_no} />
                  )}
                </dl>
              )}

              {event.remarks && (
                <p className="mt-3 whitespace-pre-wrap border-t border-hairline pt-3 text-sm text-ink-muted">
                  {event.remarks}
                </p>
              )}

              {/* evidence collected at this step — also listed on the Documents tab */}
              {(byEvent.get(event.id)?.length ?? 0) > 0 && (
                <div className="mt-3 border-t border-hairline pt-3">
                  <p className="mb-1.5 text-xs text-ink-muted">
                    {byEvent.get(event.id)!.length} attachment
                    {byEvent.get(event.id)!.length === 1 ? '' : 's'}
                  </p>
                  <ul className="flex flex-wrap gap-1.5">
                    {byEvent.get(event.id)!.map((doc) => (
                      <li key={doc.id}>
                        <button
                          type="button"
                          onClick={() => setViewing(doc)}
                          className="flex max-w-[16rem] items-center gap-1.5 rounded-lg border border-hairline bg-white px-2 py-1 text-xs text-ink-muted transition-colors hover:border-admin-300 hover:bg-admin-50/50 hover:text-ink"
                        >
                          {doc.mime_type?.startsWith('image/') ? (
                            <FileImage className="size-3.5 shrink-0 text-admin-600" />
                          ) : (
                            <FileText className="size-3.5 shrink-0 text-admin-600" />
                          )}
                          <span className="truncate">{doc.file_name ?? doc.file_url}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <p className="mt-3 text-[11px] text-slate-400">
                Logged {formatDate(event.created_at)}
              </p>
            </div>
          </li>
        );
      })}
    </ol>

    {/*
      The same viewer the Documents tab opens, so an attachment behaves the
      same way wherever it is clicked. The sidebar lists only this step's files
      — flipping from a site photo to a deed collected two steps later would be
      a different question than the one being asked here.
    */}
    {viewing && (
      <DocumentViewer
        doc={viewing}
        documents={byEvent.get(viewing.status_event_id ?? '') ?? [viewing]}
        onSelect={setViewing}
        onClose={() => setViewing(null)}
      />
    )}
    </>
  );
}
