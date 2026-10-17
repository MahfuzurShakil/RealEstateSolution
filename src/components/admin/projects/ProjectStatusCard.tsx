'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, Check, GitBranch, Lock, Upload } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Field, SelectInput, TextArea, TextInput } from '@/components/ui/Field';
import { stageRequirements } from '@/lib/domain/project-stages';
import { useMockSession } from '@/lib/auth/mock-session';
import type { Project, ProjectStatus } from '@/lib/db/types';
import {
  PROJECT_PIPELINE_STEPS,
  PROJECT_STATUS_META,
  PROJECT_STEP_CONFIG,
  BACK_MOVE_FIELDS,
  allowedNextProjectStatuses,
  projectBackMoveWarnings,
  pipelineSteps,
  projectStatusLabel,
  projectShape,
  projectStatusBlockers,
  projectStatusWarnings,
  type ProjectStepField,
} from '@/lib/domain/project';
import { projectRepository, projectStatusEventRepository } from '@/lib/repositories';
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
  /** the stage's own details and papers (client feedback 2026-10-11) */
  const [details, setDetails] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<Record<string, File>>({});

  // v26 — a plot or share project reports no construction; the shape says so
  const shape = projectShape(project.project_type);
  /*
   * Phase 3 — the stages this shape walks: a share register has no design,
   * approval or construction, and a plot scheme calls construction what it is.
   * Positions are compared on the global order so a project still sitting on a
   * status its shape skips reads as "between" steps, not off the end.
   */
  const steps = pipelineSteps(shape);
  const order = (s: ProjectStatus) => PROJECT_PIPELINE_STEPS.indexOf(s);
  const currentOrder = order(project.status);
  const nextStatuses = allowedNextProjectStatuses(project.status, shape);
  const forwardTarget = target !== null && PROJECT_PIPELINE_STEPS.indexOf(target) > PROJECT_PIPELINE_STEPS.indexOf(project.status);
  // QA audit P-03 — a step back has its own words and always asks why
  const config = target
    ? forwardTarget
      ? PROJECT_STEP_CONFIG[target]
      : {
          title: `Move back to ${projectStatusLabel(target, projectShape(project.project_type))}`,
          question: 'A step back is a correction or a setback, so it records why.',
          confirmLabel: 'Move back',
          tone: 'warning' as const,
          fields: BACK_MOVE_FIELDS,
        }
    : null;
  const label = (s: ProjectStatus) => projectStatusLabel(s, shape);

  /*
   * The pipeline used to ask only for a date and remarks, so a project with no
   * towers, no units and no reported work could be walked to Closed in six
   * clicks. Checked against the project's own records now: things that cannot
   * be true block the move, things that are merely unlikely are shown and
   * allowed.
   */
  const readiness = useLiveQuery(() => projectRepository.readiness(project.id), [project.id]);
  // QA audit P-13 — a stage cannot be dated before the one it follows
  const lastEventDate = useLiveQuery(
    async () =>
      (await projectStatusEventRepository.listForProject(project.id))
        .map((e) => e.event_date)
        .sort()
        .at(-1) ?? null,
    [project.id, project.status],
  );
  // E2E 2026-10-12 #32 — say so on the button, not after the dialog is filled in
  // a land share builds nothing, so its sale window dates are optional
  const datesMissing =
    shape.item !== 'share' && (!project.expected_start_date || !project.expected_completion_date);
  const blockersFor = (status: ProjectStatus) => [
    ...(datesMissing && order(status) > currentOrder && order(status) >= order('approval')
      ? ['Set the expected start and completion dates on the project (Edit) first']
      : []),
    ...(readiness ? projectStatusBlockers(status, readiness, shape) : []),
  ];
  const warningsFor = (status: ProjectStatus) =>
    readiness ? projectStatusWarnings(status, readiness, shape) : [];

  const targetBlockers = target ? blockersFor(target) : [];
  const forwardMove = target !== null && order(target) > currentOrder;
  // asked only when moving forward: stepping back records why, not new papers
  const stage =
    target && order(target) > currentOrder ? stageRequirements(target, project.project_type) : null;
  const targetWarnings = target
    ? forwardMove
      ? warningsFor(target)
      : readiness
        ? projectBackMoveWarnings(project.status, target, readiness, shape)
        : []
    : [];

  function open(status: ProjectStatus) {
    setTarget(status);
    // a forward move closes the current stage first (client, 2026-10-11)
    setDetails(order(status) > currentOrder ? { completed_on: todayLocal() } : {});
    setFiles({});
    setValues({
      // the original start is kept on a step back, so the dialog asks for today
      event_date:
        status === 'under_construction' && order(status) > currentOrder
          ? (project.actual_start_date ?? todayLocal())
          : todayLocal(),
    });
    setError('');
  }

  async function confirm() {
    if (!target || !config) return;
    if (targetBlockers.length > 0) {
      setError(targetBlockers[0]);
      return;
    }
    /*
     * E2E 2026-10-12 #5/#6/#8: every problem is listed at once, the stage
     * dates must run in order, and numbers cannot be negative.
     */
    const problems: string[] = [];
    for (const f of config.fields) {
      if (f.required && !values[f.key]?.trim()) problems.push(`${f.label.replace(' (required)', '')} is required`);
    }
    const today = todayLocal();
    if (values.event_date && values.event_date > today) problems.push('The date cannot be in the future');
    if (values.event_date && lastEventDate && values.event_date < lastEventDate) {
      problems.push(`The date cannot be before the previous stage move (${lastEventDate})`);
    }
    if (forwardMove) {
      const done = details.completed_on;
      if (!done) problems.push(`Say when ${label(project.status).toLowerCase()} was completed`);
      else {
        if (done > today) problems.push(`${label(project.status)} cannot be completed in the future`);
        if (lastEventDate && done < lastEventDate)
          problems.push(`${label(project.status)} cannot be completed before it started (${lastEventDate})`);
        if (values.event_date && values.event_date < done)
          problems.push(`${label(target)} cannot start before ${label(project.status).toLowerCase()} was completed (${done})`);
      }
    }
    for (const f of stage?.fields ?? []) {
      const v = details[f.key]?.trim();
      if (f.required && !v) problems.push(`${f.label} is required for this stage`);
      else if (v && f.type === 'number' && !(Number(v) >= 0)) problems.push(`${f.label} cannot be negative`);
      else if (v && f.type === 'number' && f.required && !(Number(v) > 0)) problems.push(`${f.label} must be above 0`);
      else if (v && f.type === 'date' && v > today) problems.push(`${f.label} cannot be in the future`);
    }
    for (const d of stage?.documents ?? []) {
      if (d.required && !files[d.label]) problems.push(`Upload the ${d.label.toLowerCase()} to move on`);
    }
    if (problems.length > 0) {
      setError(problems.join('\n'));
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
          details: Object.keys(details).length ? details : null,
        },
        userId,
        (stage?.documents ?? [])
          .filter((d) => files[d.label])
          .map((d) => ({ document_type: d.type, label: d.label, file: files[d.label] })),
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
              {label(project.status)}
            </Badge>
          }
        />

        <ol className="mb-4 space-y-2">
          {steps.map((step, i) => {
            const done = order(step) < currentOrder;
            const current = step === project.status;
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
                  {label(step)}
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
              const forward = order(status) > currentOrder;
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
                    {forward ? 'Move to' : 'Back to'} {label(status)}
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
        // on a tower shape the step's own title; elsewhere the shape's name for it
        title={
          forwardMove && target
            ? `Complete ${label(project.status)} → start ${label(target)}`
            : !forwardMove && target
              ? `Move back to ${label(target)}`
              : target && shape.container === 'tower'
                ? (config?.title ?? '')
                : target
                  ? `Move to ${label(target)}`
                  : ''
        }
        subtitle={`${project.code} · ${project.name}`}
        tone={config?.tone ?? 'default'}
        icon={GitBranch}
        confirmLabel={
          forwardMove && target
            ? `Complete & start ${label(target)}`
            : !forwardMove
              ? 'Move back'
              : shape.container === 'tower'
              ? (config?.confirmLabel ?? 'Confirm')
              : target
                ? label(target)
                : 'Confirm'
        }
        message={forwardMove ? undefined : config?.question}
        // landscape, two columns: what was completed beside what starts (2026-10-11)
        size={forwardMove ? 'xl' : 'sm'}
        busy={busy}
        onCancel={() => setTarget(null)}
        onConfirm={confirm}
      >
        {targetWarnings.length > 0 && (
          <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
            <p className="flex items-center gap-1.5 text-sm font-medium text-amber-800">
              <AlertTriangle className="size-4" />{' '}
              {forwardMove ? 'The records do not agree with this yet' : 'Before you move it back'}
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
        <div className={forwardMove ? 'grid items-start gap-5 lg:grid-cols-2' : ''}>
        {forwardMove && (
          <div className="grid gap-3 rounded-xl border border-admin-100 bg-admin-50/40 p-3 sm:grid-cols-2 [&>p]:sm:col-span-2">
            <p className="text-sm font-semibold text-ink">
              1 · {label(project.status)} completed
            </p>
            <Field label={`${label(project.status)} completed on`} required>
              <TextInput
                type="date"
                value={details.completed_on ?? ''}
                onChange={(e) => setDetails((d) => ({ ...d, completed_on: e.target.value }))}
              />
            </Field>
            {stage?.fields.map((f) => (
              <Field key={f.key} label={f.label} required={f.required}>
                {f.type === 'select' ? (
                  <SelectInput
                    value={details[f.key] ?? ''}
                    onChange={(e) => setDetails((d) => ({ ...d, [f.key]: e.target.value }))}
                  >
                    <option value="">Choose…</option>
                    {f.options?.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </SelectInput>
                ) : (
                  <TextInput
                    type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                    value={details[f.key] ?? ''}
                    placeholder={f.placeholder}
                    onChange={(e) => setDetails((d) => ({ ...d, [f.key]: e.target.value }))}
                  />
                )}
              </Field>
            ))}
            {stage?.documents.map((doc) => (
              <Field key={doc.label} label={doc.label} required={doc.required}>
                <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-hairline bg-white px-3 py-2 text-sm text-ink-muted hover:border-admin-300">
                  <Upload className="size-4 shrink-0 text-admin-600" />
                  <span className="truncate">{files[doc.label]?.name ?? 'Choose file'}</span>
                  <input
                    type="file"
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      setFiles((prev) => {
                        const next = { ...prev };
                        if (f) next[doc.label] = f;
                        else delete next[doc.label];
                        return next;
                      });
                    }}
                  />
                </label>
              </Field>
            ))}
          </div>
        )}
        <div className={forwardMove ? 'rounded-xl border border-hairline bg-white p-3' : ''}>
          {forwardMove && (
            <p className="mb-1 text-sm font-semibold text-ink">
              2 · {target ? label(target) : ''} starts
            </p>
          )}
          {config?.fields.map(renderField)}
        </div>
        </div>
        {error && <p className="mt-2 whitespace-pre-line text-xs text-red-600">{error}</p>}
      </ConfirmDialog>
    </>
  );
}
