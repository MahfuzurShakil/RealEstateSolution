'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { Check, CircleDashed, FileText, History } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import type { ProjectStatusEvent } from '@/lib/db/types';
import { PROJECT_STATUS_META } from '@/lib/domain/project';
import { stageRequirements } from '@/lib/domain/project-stages';
import {
  documentRepository,
  projectRepository,
  projectStatusEventRepository,
} from '@/lib/repositories';
import { useBlobUrl } from '@/components/ui/useBlobUrl';
import { formatDate, humanize } from '@/lib/utils/format';

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="text-sm text-ink">{value}</dd>
    </div>
  );
}

/** Audit trail of every pipeline step with the details captured at the time. */
export function ProjectTimeline({ projectId }: { projectId: string }) {
  const events = useLiveQuery(
    () => projectStatusEventRepository.listForProject(projectId),
    [projectId],
  );
  const project = useLiveQuery(() => projectRepository.getById(projectId), [projectId]);
  // the stage papers filed against each step (2026-10-11)
  const docs = useLiveQuery(() => documentRepository.listForEntity('project', projectId), [projectId]);

  if (events === undefined) return <p className="text-sm text-ink-muted">Loading…</p>;

  if (events.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="No pipeline activity yet"
        description="Every status change is logged here with its date, who did it and the reference recorded at the time."
      />
    );
  }

  return (
    <ol className="relative space-y-4 pl-8">
      {/* the trunk of the tree */}
      <span className="absolute bottom-3 left-[11px] top-3 w-px bg-hairline" aria-hidden />

      {events.map((event: ProjectStatusEvent, index) => {
        const meta = PROJECT_STATUS_META[event.to_status];
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
                    from {PROJECT_STATUS_META[event.from_status].label}
                  </span>
                </div>
                <span className="text-xs font-medium text-ink">{formatDate(event.event_date)}</span>
              </div>

              {(event.performed_by || event.reference_no) && (
                <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                  {event.performed_by && <Detail label="By" value={event.performed_by} />}
                  {event.reference_no && <Detail label="Reference" value={event.reference_no} />}
                </dl>
              )}

              {event.details && Object.keys(event.details).length > 0 && (
                <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                  {Object.entries(event.details).map(([key, value]) => (
                    <Detail
                      key={key}
                      label={
                        (project &&
                          stageRequirements(event.to_status, project.project_type).fields.find(
                            (f) => f.key === key,
                          )?.label) ||
                        humanize(key)
                      }
                      value={value}
                    />
                  ))}
                </dl>
              )}

              {(docs ?? []).some((d) => d.status_event_id === event.id) && (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {(docs ?? [])
                    .filter((d) => d.status_event_id === event.id)
                    .map((d) => (
                      <li key={d.id}>
                        <FileChip name={d.notes || humanize(d.document_type)} file={d.file_data} fileName={d.file_name ?? ''} />
                      </li>
                    ))}
                </ul>
              )}

              {event.remarks && (
                <p className="mt-3 whitespace-pre-wrap border-t border-hairline pt-3 text-sm text-ink-muted">
                  {event.remarks}
                </p>
              )}

              <p className="mt-3 text-[11px] text-slate-400">Logged {formatDate(event.created_at)}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** A stage paper, opened in a new tab. */
function FileChip({ name, file, fileName }: { name: string; file?: Blob | null; fileName: string }) {
  const url = useBlobUrl(file ?? null);
  return (
    <a
      href={url ?? undefined}
      target="_blank"
      rel="noreferrer"
      title={fileName}
      className="inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-slate-50 px-2.5 py-1 text-xs font-medium text-ink hover:border-admin-300"
    >
      <FileText className="size-3.5 text-admin-600" /> {name}
    </a>
  );
}
