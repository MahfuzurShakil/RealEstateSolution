'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, Check, GitBranch, Lock } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Field, TextArea, TextInput } from '@/components/ui/Field';
import { useMockSession } from '@/lib/auth/mock-session';
import type { Project, ProjectStatus } from '@/lib/db/types';
import {
  PROJECT_PIPELINE_STEPS,
  PROJECT_STATUS_META,
  PROJECT_STEP_CONFIG,
  allowedNextProjectStatuses,
  projectStatusBlockers,
  projectStatusWarnings,
  type ProjectStepField,
} from '@/lib/domain/project';
import { projectRepository } from '@/lib/repositories';
import { cn } from '@/lib/utils/cn';
import { todayLocal } from '@/lib/utils/format';

/**
 * Pipeline trail + the transitions valid from the current status (Section 3.2).
 *
 * Every move opens a dialog that also captures what happened — the date it
 * actually happened, who did it, the approval or work-order reference — and
 * that becomes the Timeline tab. A stray click cannot advance a project, and
 * six months later somebody can still see when RAJUK approved it.
 */
export function ProjectStatusCard({ project }: { project: Project }) {
  const { userId } = useMockSession();
  const [target, setTarget] = useState<ProjectStatus | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const currentIndex = PROJECT_PIPELINE_STEPS.indexOf(project.status);
  const nextStatuses = allowedNextProjectStatuses(project.status);
  const config = target ? PROJECT_STEP_CONFIG[target] : null;

  /*
   * The pipeline used to ask only for a date and remarks, so a project with no
   * towers, no units and no reported work could be walked to Closed in six
   * clicks. Checked against the project's own records now: things that cannot
   * be true block the move, things that are merely unlikely are shown and
   * allowed.
   */
  const readiness = useLiveQuery(() => projectRepository.readiness(project.id), [project.id]);
  const blockersFor = (status: ProjectStatus) =>
    readiness ? projectStatusBlockers(status, readiness) : [];
  const warningsFor = (status: ProjectStatus) =>
    readiness ? projectStatusWarnings(status, readiness) : [];

  const targetBlockers = target ? blockersFor(target) : [];
  const targetWarnings = target ? warningsFor(target) : [];

  function open(status: ProjectStatus) {
    setTarget(status);
    setValues({
      event_date:
        status === 'under_construction' ? (project.actual_start_date ?? todayLocal()) : todayLocal(),
    });
    setError('');
  }

  async function confirm() {
    if (!target || !config) return;
    if (targetBlockers.length > 0) {
      setError(targetBlockers[0]);
      return;
    }
    const missing = config.fields.find((f) => f.required && !values[f.key]?.trim());
    if (missing) {
      setError(`${missing.label.replace(' (required)', '')} is required`);
      return;
    }

    setBusy(true);
    try {
      await projectRepository.setStatus(
        project.id,
        target,
        {
          event_date: values.event_date,
          performed_by: values.performed_by?.trim() || null,
          reference_no: values.reference_no?.trim() || null,
          remarks: values.remarks?.trim() || null,
        },
        userId,
      );
      setTarget(null);
    } finally {
      setBusy(false);
    }
  }

  function renderField(field: ProjectStepField) {
    const value = values[field.key] ?? '';
    const onChange = (v: string) => setValues((prev) => ({ ...prev, [field.key]: v }));

    return (
      <Field
        key={field.key}
        label={field.label}
        required={field.required}
        className="mt-3 first:mt-0"
      >
        {field.type === 'textarea' ? (
          <TextArea
            value={value}
            placeholder={field.placeholder}
            onChange={(e) => onChange(e.target.value)}
          />
        ) : (
          <TextInput
            type={field.type}
            value={value}
            placeholder={field.placeholder}
            onChange={(e) => onChange(e.target.value)}
          />
        )}
      </Field>
    );
  }

  return (
    <>
      <Card>
        <CardHeader
          title="Project Status"
          action={
            <Badge tone={PROJECT_STATUS_META[project.status].tone}>
              {PROJECT_STATUS_META[project.status].label}
            </Badge>
          }
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
              const blocked = blockersFor(status);
              return (
                <div key={status}>
                  <Button
                    variant={forward ? 'primary' : 'outline'}
                    size="sm"
                    className="w-full"
                    disabled={blocked.length > 0}
                    onClick={() => open(status)}
                  >
                    {blocked.length > 0 ? (
                      <Lock className="size-4" />
                    ) : (
                      <GitBranch className="size-4" />
                    )}
                    {forward ? 'Move to' : 'Back to'} {PROJECT_STATUS_META[status].label}
                  </Button>
                  {blocked.length > 0 && (
                    <ul className="mt-1.5 space-y-1 text-xs text-amber-700">
                      {blocked.map((b) => (
                        <li key={b}>• {b}</li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={target !== null && config !== null}
        title={config?.title ?? ''}
        subtitle={`${project.code} · ${project.name}`}
        tone={config?.tone ?? 'default'}
        icon={GitBranch}
        confirmLabel={config?.confirmLabel ?? 'Confirm'}
        message={config?.question}
        busy={busy}
        onCancel={() => setTarget(null)}
        onConfirm={confirm}
      >
        {targetWarnings.length > 0 && (
          <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
            <p className="flex items-center gap-1.5 text-sm font-medium text-amber-800">
              <AlertTriangle className="size-4" /> The records do not agree with this yet
            </p>
            <ul className="mt-1 space-y-1 text-xs text-amber-700">
              {targetWarnings.map((w) => (
                <li key={w}>• {w}</li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-amber-700">
              You can still record the move — say why in the remarks so it makes sense later.
            </p>
          </div>
        )}
        {config?.fields.map(renderField)}
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      </ConfirmDialog>
    </>
  );
}
