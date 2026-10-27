'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Eye, EyeOff, Globe, Pencil, Plus, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Checkbox, Field, SelectInput, TextArea, TextInput } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { cn } from '@/lib/utils/cn';

/*
 * One editor for the four website lists (testimonials, team, awards, FAQ).
 * Each tab passes its fields and how a row reads in the list; adding, editing,
 * publishing, reordering and deleting work the same everywhere.
 */

export type FieldSpec = {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'select';
  required?: boolean;
  hint?: string;
  placeholder?: string;
  options?: { value: string; label: string }[];
  /** two fields side by side; textareas always take the full row */
  half?: boolean;
  /** starting value for a new row (a select's first real option) */
  defaultValue?: string;
  /** a select whose values are numbers (stars) */
  numeric?: boolean;
};

type Row = { id: string; is_published: boolean; sort_order: number } & Record<string, unknown>;
type Values = Record<string, string>;

export interface ContentRepo {
  add: (input: never, createdBy?: string | null) => Promise<unknown>;
  update: (id: string, changes: never) => Promise<unknown>;
  remove: (id: string) => Promise<void>;
  move: (id: string, direction: -1 | 1) => Promise<void>;
}

function toValues(fields: FieldSpec[], row?: Row): Values {
  return Object.fromEntries(
    fields.map((f) => [f.key, row ? (row[f.key] == null ? '' : String(row[f.key])) : (f.defaultValue ?? '')]),
  );
}

function fromValues(fields: FieldSpec[], values: Values): Record<string, unknown> {
  return Object.fromEntries(
    fields.map((f) => {
      const v = values[f.key].trim();
      if (f.type === 'number' || f.numeric) return [f.key, v ? Number(v) : null];
      return [f.key, v || (f.required ? '' : null)];
    }),
  );
}

export function ContentListEditor({
  noun,
  rows,
  fields,
  repo,
  primary,
  secondary,
  emptyHint,
  validate,
  userId,
}: {
  /** singular, lower case: "testimonial" */
  noun: string;
  rows: Row[] | undefined;
  fields: FieldSpec[];
  repo: ContentRepo;
  primary: (row: Row) => string;
  secondary?: (row: Row) => string | null;
  emptyHint: string;
  /** extra checks beyond "required"; returns field → message */
  validate?: (values: Values) => Record<string, string>;
  userId: string | null;
}) {
  const [editing, setEditing] = useState<Row | 'new' | null>(null);
  const [values, setValues] = useState<Values>({});
  const [publish, setPublish] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<Row | null>(null);

  const open = (row: Row | 'new') => {
    setEditing(row);
    setValues(toValues(fields, row === 'new' ? undefined : row));
    setPublish(row === 'new' ? true : row.is_published);
    setErrors({});
  };

  const save = async () => {
    const found: Record<string, string> = {};
    for (const f of fields) if (f.required && !values[f.key].trim()) found[f.key] = `${f.label} is needed.`;
    Object.assign(found, validate?.(values) ?? {});
    setErrors(found);
    if (Object.keys(found).length || !editing) return;
    setSaving(true);
    try {
      const data = { ...fromValues(fields, values), is_published: publish };
      if (editing === 'new') await repo.add(data as never, userId);
      else await repo.update(editing.id, data as never);
      setEditing(null);
    } finally {
      setSaving(false);
    }
  };

  const title = noun.charAt(0).toUpperCase() + noun.slice(1);

  return (
    <>
      <div className="mb-3 flex justify-end">
        <Button onClick={() => open('new')}>
          <Plus className="size-4" /> Add {noun}
        </Button>
      </div>

      {rows === undefined ? (
        <p className="text-sm text-ink-muted">Loading…</p>
      ) : rows.length === 0 ? (
        <EmptyState icon={Globe} title={`No ${noun}s yet`} description={emptyHint} />
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-hairline">
            {rows.map((row, i) => (
              <li key={row.id} className={cn('flex items-start gap-3 px-4 py-3', !row.is_published && 'bg-slate-50/70')}>
                <div className="flex flex-col">
                  <button
                    type="button"
                    aria-label="Move up"
                    disabled={i === 0}
                    onClick={() => repo.move(row.id, -1)}
                    className="rounded p-0.5 text-ink-muted hover:text-ink disabled:opacity-30"
                  >
                    <ChevronUp className="size-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Move down"
                    disabled={i === rows.length - 1}
                    onClick={() => repo.move(row.id, 1)}
                    className="rounded p-0.5 text-ink-muted hover:text-ink disabled:opacity-30"
                  >
                    <ChevronDown className="size-4" />
                  </button>
                </div>
                <div className="min-w-0 flex-1">
                  <p className={cn('text-sm font-medium', row.is_published ? 'text-ink' : 'text-ink-muted')}>{primary(row)}</p>
                  {secondary?.(row) && <p className="mt-0.5 line-clamp-2 text-xs text-ink-muted">{secondary(row)}</p>}
                </div>
                <Badge tone={row.is_published ? 'green' : 'neutral'}>{row.is_published ? 'On website' : 'Hidden'}</Badge>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    title={row.is_published ? 'Hide from the website' : 'Show on the website'}
                    aria-label={row.is_published ? 'Hide from the website' : 'Show on the website'}
                    onClick={() => repo.update(row.id, { is_published: !row.is_published } as never)}
                    className="grid size-8 place-items-center rounded-lg text-ink-muted hover:bg-slate-100 hover:text-ink"
                  >
                    {row.is_published ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                  <button
                    type="button"
                    aria-label={`Edit ${noun}`}
                    onClick={() => open(row)}
                    className="grid size-8 place-items-center rounded-lg text-ink-muted hover:bg-slate-100 hover:text-ink"
                  >
                    <Pencil className="size-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${noun}`}
                    onClick={() => setDeleting(row)}
                    className="grid size-8 place-items-center rounded-lg text-ink-muted hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Modal
        open={editing !== null}
        title={editing === 'new' ? `Add ${noun}` : `Edit ${noun}`}
        icon={Globe}
        onClose={() => setEditing(null)}
        footer={
          <>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? 'Saving…' : `Save ${noun}`}
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {fields.map((f) => (
            <Field
              key={f.key}
              label={f.label}
              required={f.required}
              hint={f.hint}
              error={errors[f.key]}
              className={f.half && f.type !== 'textarea' ? undefined : 'sm:col-span-2'}
            >
              {f.type === 'textarea' ? (
                <TextArea
                  rows={4}
                  value={values[f.key] ?? ''}
                  placeholder={f.placeholder}
                  invalid={Boolean(errors[f.key])}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                />
              ) : f.type === 'select' ? (
                <SelectInput value={values[f.key] ?? ''} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}>
                  {f.options?.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </SelectInput>
              ) : (
                <TextInput
                  inputMode={f.type === 'number' ? 'numeric' : undefined}
                  value={values[f.key] ?? ''}
                  placeholder={f.placeholder}
                  invalid={Boolean(errors[f.key])}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                />
              )}
            </Field>
          ))}
          <Checkbox className="sm:col-span-2" label="Show on the website" checked={publish} onChange={(e) => setPublish(e.target.checked)} />
        </div>
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        title={`Delete ${noun}`}
        subtitle={deleting ? primary(deleting) : undefined}
        message={`This ${noun} is removed from the website and from this list. To keep it for later, hide it instead.`}
        confirmLabel={`Delete ${title.toLowerCase()}`}
        onConfirm={async () => {
          if (deleting) await repo.remove(deleting.id);
          setDeleting(null);
        }}
        onCancel={() => setDeleting(null)}
      />
    </>
  );
}
