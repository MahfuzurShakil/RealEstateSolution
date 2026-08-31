'use client';

import { useState } from 'react';
import { Check, GitBranch } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Field, TextInput } from '@/components/ui/Field';
import type { Project, ProjectStatus } from '@/lib/db/types';
import {
  PROJECT_PIPELINE_STEPS,
  PROJECT_STATUS_META,
  allowedNextProjectStatuses,
  statusStartsConstruction,
} from '@/lib/domain/project';
import { projectRepository } from '@/lib/repositories';
import { cn } from '@/lib/utils/cn';
import { todayLocal } from '@/lib/utils/format';

/**
 * Pipeline trail + the valid transitions (Section 3.2). Moving to
 * `under_construction` also stamps `actual_start_date` — that is the moment the
 * field is for, and asking the user twice for the same date is noise.
 */
export function ProjectStatusCard({ project }: { project: Project }) {
  const [target, setTarget] = useState<ProjectStatus | null>(null);
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);

  const currentIndex = PROJECT_PIPELINE_STEPS.indexOf(project.status);
  const nextStatuses = allowedNextProjectStatuses(project.status);
  const startsConstruction = target ? statusStartsConstruction(target) : false;

  function open(status: ProjectStatus) {
    setTarget(status);
    setDate(project.actual_start_date ?? todayLocal());
  }

  async function confirm() {
    if (!target) return;
    setBusy(true);
    try {
      await projectRepository.update(project.id, {
        status: target,
        ...(startsConstruction ? { actual_start_date: date } : {}),
      });
      setTarget(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Card>
        <CardHeader
          title="Project Status"
          action={<Badge tone={PROJECT_STATUS_META[project.status].tone}>
            {PROJECT_STATUS_META[project.status].label}
          </Badge>}
        />

        <ol className="mb-4 space-y-2">
          {PROJECT_PIPELINE_STEPS.map((step, i) => {
            const done = i < currentIndex;
            const current = i === currentIndex;
            return (
              <li key={step} className="flex items-center gap-2.5">
                <span
                  className={cn(
                    'grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-semibold',
                    done && 'bg-admin-500 text-white',
                    current && 'bg-admin-100 text-admin-700 ring-2 ring-admin-300',
                    !done && !current && 'bg-slate-100 text-slate-400',
                  )}
                >
                  {done ? <Check className="size-3" /> : i + 1}
                </span>
                <span
                  className={cn(
                    'text-sm',
                    current ? 'font-medium text-ink' : done ? 'text-ink-muted' : 'text-slate-400',
                  )}
                >
                  {PROJECT_STATUS_META[step].label}
                </span>
              </li>
            );
          })}
        </ol>

        {nextStatuses.length === 0 ? (
          <p className="text-xs text-ink-muted">The project is closed — no further moves.</p>
        ) : (
          <div className="space-y-2">
            {nextStatuses.map((status) => {
              const forward = PROJECT_PIPELINE_STEPS.indexOf(status) > currentIndex;
              return (
                <Button
                  key={status}
                  variant={forward ? 'primary' : 'outline'}
                  size="sm"
                  className="w-full"
                  onClick={() => open(status)}
                >
                  <GitBranch className="size-4" />
                  {forward ? 'Move to' : 'Back to'} {PROJECT_STATUS_META[status].label}
                </Button>
              );
            })}
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={target !== null}
        title={target ? `Move to ${PROJECT_STATUS_META[target].label}` : ''}
        subtitle={project.code}
        tone="default"
        icon={GitBranch}
        confirmLabel="Update status"
        message={
          startsConstruction
            ? 'Construction is starting — the date below is saved as the actual start date.'
            : `The project moves from ${PROJECT_STATUS_META[project.status].label} to ${
                target ? PROJECT_STATUS_META[target].label : ''
              }.`
        }
        busy={busy}
        onCancel={() => setTarget(null)}
        onConfirm={confirm}
      >
        {startsConstruction && (
          <Field label="Actual start date" required>
            <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        )}
      </ConfirmDialog>
    </>
  );
}
