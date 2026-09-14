'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronDown, ChevronUp, Eye, EyeOff, ListChecks, Pencil, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Checkbox, Field, SelectInput, TextArea, TextInput } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useMockSession } from '@/lib/auth/mock-session';
import type { DdCategory, DdChecklistItem } from '@/lib/db/types';
import { DD_CATEGORIES, DD_CATEGORY_LABEL } from '@/lib/db/types';
import { ddChecklistRepository } from '@/lib/repositories';
import { cn } from '@/lib/utils/cn';

/**
 * The due-diligence checklist, editable without a deploy (BRD DD-001).
 *
 * Its own card on Master Data rather than a `lookup_values` group, because an
 * item carries `is_mandatory` — which gate G2 reads — and a category that
 * sections the land's tab. The generic lookup editor has nowhere to put
 * either.
 *
 * Items are deactivated, never deleted: a land whose due diligence already
 * references one has to keep reading a real row.
 */
export function DdChecklistEditor() {
  const { userId } = useMockSession();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<DdChecklistItem | 'new' | null>(null);
  const [toggling, setToggling] = useState<DdChecklistItem | null>(null);
  const [usage, setUsage] = useState<number | null>(null);

  const items = useLiveQuery(() => ddChecklistRepository.allItems(), []);
  const active = items?.filter((i) => i.is_active) ?? [];
  const mandatory = active.filter((i) => i.is_mandatory);

  return (
    <>
      <Card className="p-0">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center gap-3 p-4 text-left"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-admin-50 text-admin-600">
            <ListChecks className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-ink">
              Legal Due Diligence checklist
            </span>
            <span className="block text-xs text-ink-muted">
              What every land is checked against before it can be acquired
            </span>
          </span>
          <Badge>{active.length} active</Badge>
          <Badge tone="amber">{mandatory.length} mandatory</Badge>
          {open ? (
            <ChevronUp className="size-4 shrink-0 text-ink-muted" />
          ) : (
            <ChevronDown className="size-4 shrink-0 text-ink-muted" />
          )}
        </button>

        {open && (
          <div className="border-t border-hairline p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-ink-muted">
                Only mandatory items block acquisition. Changing this list does not change lands
                already checked — each land snapshots whether an item was mandatory when its
                checklist was built.
              </p>
              <Button size="sm" onClick={() => setEditing('new')}>
                <Plus className="size-4" /> Add item
              </Button>
            </div>

            <div className="space-y-4">
              {DD_CATEGORIES.map((category) => {
                const rows = (items ?? []).filter((i) => i.category === category);
                if (rows.length === 0) return null;
                return (
                  <section key={category}>
                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                      {DD_CATEGORY_LABEL[category]}
                    </h4>
                    <ul className="space-y-1.5">
                      {rows.map((item) => (
                        <li
                          key={item.id}
                          className={cn(
                            'flex flex-wrap items-center gap-2 rounded-xl border border-hairline px-3 py-2',
                            !item.is_active && 'opacity-55',
                          )}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm text-ink">{item.label}</span>
                            {item.guidance && (
                              <span className="block text-xs text-ink-muted">{item.guidance}</span>
                            )}
                          </span>
                          {item.is_mandatory && <Badge tone="amber">Mandatory</Badge>}
                          {!item.is_active && <Badge tone="neutral">Retired</Badge>}
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label="Edit item"
                            onClick={() => setEditing(item)}
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={item.is_active ? 'Retire item' : 'Restore item'}
                            onClick={async () => {
                              setUsage(await ddChecklistRepository.usageCount(item.id));
                              setToggling(item);
                            }}
                          >
                            {item.is_active ? (
                              <EyeOff className="size-4" />
                            ) : (
                              <Eye className="size-4" />
                            )}
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          </div>
        )}
      </Card>

      {editing && (
        <ItemDialog
          item={editing === 'new' ? undefined : editing}
          userId={userId}
          onClose={() => setEditing(null)}
        />
      )}

      <ConfirmDialog
        open={toggling !== null}
        title={toggling?.is_active ? 'Retire this checklist item' : 'Restore this checklist item'}
        subtitle={toggling?.label}
        tone={toggling?.is_active ? 'warning' : 'default'}
        confirmLabel={toggling?.is_active ? 'Retire item' : 'Restore item'}
        message={
          toggling?.is_active
            ? usage
              ? `${usage} land${usage === 1 ? '' : 's'} already ${usage === 1 ? 'has' : 'have'} a finding against this item. Retiring it stops new lands from being checked against it; the existing findings stay exactly as they are.`
              : 'No land has been checked against this item yet. Retiring it removes it from new checklists.'
            : 'New land checklists will include this item again. Lands already in progress pick it up next time their Due Diligence tab is opened.'
        }
        onCancel={() => setToggling(null)}
        onConfirm={async () => {
          if (toggling) {
            await ddChecklistRepository.update(toggling.id, { is_active: !toggling.is_active });
          }
          setToggling(null);
        }}
      />
    </>
  );
}

function ItemDialog({
  item,
  userId,
  onClose,
}: {
  item?: DdChecklistItem;
  userId: string | null;
  onClose: () => void;
}) {
  const [label, setLabel] = useState(item?.label ?? '');
  const [category, setCategory] = useState<DdCategory>(item?.category ?? 'ownership');
  const [guidance, setGuidance] = useState(item?.guidance ?? '');
  const [isMandatory, setIsMandatory] = useState(item?.is_mandatory ?? false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!label.trim()) {
      setError('Give the check a name');
      return;
    }
    setError('');
    setSaving(true);
    try {
      if (item) {
        await ddChecklistRepository.update(item.id, {
          label: label.trim(),
          category,
          guidance: guidance.trim() || null,
          is_mandatory: isMandatory,
        });
      } else {
        /*
         * The code is derived from the label once, at creation. It is the
         * stable key, so renaming the label later must not move it — which is
         * exactly why the label is not the key.
         */
        const code = label
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_|_$/g, '')
          .slice(0, 40);
        await ddChecklistRepository.create(
          {
            code: `${code}_${Date.now().toString(36)}`,
            label: label.trim(),
            category,
            guidance: guidance.trim() || null,
            is_mandatory: isMandatory,
            sort_order: await ddChecklistRepository.nextSortOrder(),
            is_active: true,
          },
          userId,
        );
      }
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      title={item ? 'Edit checklist item' : 'Add checklist item'}
      icon={ListChecks}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Field label="Check" required error={error || undefined}>
          <TextInput
            value={label}
            placeholder="e.g. Encumbrance search clear"
            onChange={(e) => {
              setLabel(e.target.value);
              setError('');
            }}
          />
        </Field>

        <Field label="Category" required>
          <SelectInput value={category} onChange={(e) => setCategory(e.target.value as DdCategory)}>
            {DD_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {DD_CATEGORY_LABEL[c]}
              </option>
            ))}
          </SelectInput>
        </Field>

        <Field label="Guidance" hint="What the lawyer is actually being asked to confirm">
          <TextArea
            value={guidance}
            placeholder="e.g. Sub-registry search certificate covering the last 25 years."
            onChange={(e) => setGuidance(e.target.value)}
          />
        </Field>

        <div>
          <Checkbox
            label="Mandatory — blocks acquisition until settled"
            checked={isMandatory}
            onChange={(e) => setIsMandatory(e.target.checked)}
          />
          <p className="mt-1 text-xs text-ink-muted">
            Mandatory items are the ones gate G2 enforces. An optional item left pending is a note;
            a mandatory one stops the land being marked acquired until it passes, is waived, or is
            marked not applicable.
          </p>
        </div>
      </div>
    </Modal>
  );
}
