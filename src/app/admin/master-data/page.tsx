'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ChevronDown,
  ChevronUp,
  Database,
  Eye,
  EyeOff,
  Pencil,
  Plus,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field, TextInput } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { useMockSession } from '@/lib/auth/mock-session';
import type { LookupValue } from '@/lib/db/types';
import { DuplicateLookupError, SystemOptionError, lookupRepository } from '@/lib/repositories';
import { cn } from '@/lib/utils/cn';
import { humanize } from '@/lib/utils/format';

function groupTitle(category: string, scope: string | null): string {
  return scope ? `${humanize(category)} — ${humanize(scope)}` : humanize(category);
}

/**
 * Master Data (Section 1.2 / 9.7).
 *
 * Only "pick an option" lists live here. Workflow statuses — lead status,
 * booking status, PO status — are ENUMs because business logic branches on
 * them, and letting an admin add a value the code has never heard of would
 * break the pipelines rather than extend them. Section 1.2 draws that line;
 * this screen respects it by only ever showing what is actually in
 * `lookup_values`.
 */
export default function MasterDataPage() {
  const { userId } = useMockSession();
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [addTo, setAddTo] = useState<{ category: string; scope: string | null } | null>(null);
  const [renaming, setRenaming] = useState<LookupValue | null>(null);
  const [confirmHide, setConfirmHide] = useState<LookupValue | null>(null);
  const [hideError, setHideError] = useState<string | null>(null);

  const groups = useLiveQuery(() => lookupRepository.groups(), []);

  if (groups === undefined) return <p className="text-sm text-ink-muted">Loading…</p>;

  return (
    <>
      <PageHeader
        title="Master Data"
        subtitle="The option lists behind the dropdowns — editable without a code change."
      />

      {groups.length === 0 ? (
        <EmptyState
          icon={Database}
          title="No option list yet"
          description="Master data is seeded on a fresh database. Reload the sample data from the dashboard if this is unexpected."
        />
      ) : (
        <div className="space-y-3">
          {groups.map((group) => {
            const key = `${group.category}::${group.scope ?? ''}`;
            const isOpen = openKey === key;
            return (
              <Card key={key}>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setOpenKey(isOpen ? null : key)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <ChevronDown
                      className={cn(
                        'size-4 shrink-0 text-ink-muted transition-transform',
                        isOpen && 'rotate-180',
                      )}
                    />
                    <span className="truncate text-sm font-semibold text-ink">
                      {groupTitle(group.category, group.scope)}
                    </span>
                    <Badge tone="neutral">{group.active} active</Badge>
                    {group.total > group.active && (
                      <Badge tone="amber">{group.total - group.active} retired</Badge>
                    )}
                  </button>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setAddTo({ category: group.category, scope: group.scope })}
                  >
                    <Plus className="size-4" /> Add option
                  </Button>
                </div>

                {isOpen && (
                  <OptionList
                    category={group.category}
                    scope={group.scope}
                    onRename={setRenaming}
                    onHide={(row) => {
                      setHideError(null);
                      setConfirmHide(row);
                    }}
                  />
                )}
              </Card>
            );
          })}
        </div>
      )}

      <p className="mt-5 text-xs text-ink-muted">
        Workflow statuses are deliberately not here. A lead moving to “Booked” or a purchase order
        to “Received” runs code that branches on those exact values, so an option added by hand
        would be a status nothing knows how to handle (Section 1.2).
      </p>

      {addTo && (
        <AddOptionModal
          category={addTo.category}
          scope={addTo.scope}
          userId={userId}
          onClose={() => setAddTo(null)}
        />
      )}

      {renaming && <RenameOptionModal row={renaming} onClose={() => setRenaming(null)} />}

      <ConfirmDialog
        open={confirmHide !== null}
        title={`Retire “${confirmHide?.value ?? ''}”`}
        tone="warning"
        icon={EyeOff}
        confirmLabel="Retire option"
        message={
          hideError ??
          'It stops appearing in the dropdown, but records that already use it keep reading correctly — which is why an option is retired rather than deleted. It can be brought back at any time.'
        }
        onCancel={() => {
          setConfirmHide(null);
          setHideError(null);
        }}
        onConfirm={async () => {
          /*
           * The retire button is already disabled for a built-in option, so
           * this catch is the second line rather than the first. It is here
           * because the repository guard is the one that actually protects the
           * data, and a rejected write that closed the dialog silently would
           * look exactly like a successful one.
           */
          if (!confirmHide) return;
          try {
            await lookupRepository.setActive(confirmHide.id, false);
            setConfirmHide(null);
          } catch (error) {
            setHideError(
              error instanceof SystemOptionError
                ? error.message
                : 'That option could not be retired.',
            );
          }
        }}
      />
    </>
  );
}

function OptionList({
  category,
  scope,
  onRename,
  onHide,
}: {
  category: string;
  scope: string | null;
  onRename: (row: LookupValue) => void;
  onHide: (row: LookupValue) => void;
}) {
  const rows = useLiveQuery(() => lookupRepository.listAll(category, scope), [category, scope]);

  if (rows === undefined) return <p className="mt-4 text-sm text-ink-muted">Loading…</p>;
  if (rows.length === 0) {
    return <p className="mt-4 text-sm text-ink-muted">This list is empty.</p>;
  }

  return (
    <ul className="mt-4 space-y-2 border-t border-hairline pt-4">
      {rows.map((row, index) => (
        <li
          key={row.id}
          className={cn(
            'flex flex-wrap items-center gap-2 rounded-xl border border-hairline p-3',
            !row.is_active && 'bg-canvas/60',
          )}
        >
          <span className="w-6 shrink-0 text-xs text-ink-muted">{index + 1}</span>
          <span
            className={cn(
              'min-w-0 flex-1 truncate text-sm',
              row.is_active ? 'font-medium text-ink' : 'text-ink-muted line-through',
            )}
          >
            {row.value}
          </span>

          {!row.is_active && <Badge tone="neutral">Retired</Badge>}
          {/* A built-in option the application's own code keys off (Tier 3.3).
              Saying so is the point: an admin who cannot retire "Land Payment"
              should be able to see why without trying it. */}
          {row.is_system && <Badge tone="teal">Built-in</Badge>}

          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Move ${row.value} up`}
              disabled={index === 0}
              onClick={() => lookupRepository.move(row.id, 'up')}
            >
              <ChevronUp className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Move ${row.value} down`}
              disabled={index === rows.length - 1}
              onClick={() => lookupRepository.move(row.id, 'down')}
            >
              <ChevronDown className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Rename ${row.value}`}
              onClick={() => onRename(row)}
            >
              <Pencil className="size-4" />
            </Button>
            {row.is_active ? (
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Retire ${row.value}`}
                disabled={row.is_system}
                title={
                  row.is_system
                    ? 'A built-in option cannot be retired — the finance screens key off it. It can still be renamed and reordered.'
                    : undefined
                }
                onClick={() => onHide(row)}
              >
                <EyeOff className="size-4" />
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Restore ${row.value}`}
                onClick={() => lookupRepository.setActive(row.id, true)}
              >
                <Eye className="size-4" />
              </Button>
            )}
          </div>
        </li>
      ))}

      <li className="pt-1 text-xs text-ink-muted">
        The order here is the order the dropdown shows, so the option people pick most can sit at
        the top.
      </li>
    </ul>
  );
}

function AddOptionModal({
  category,
  scope,
  userId,
  onClose,
}: {
  category: string;
  scope: string | null;
  userId: string;
  onClose: () => void;
}) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await lookupRepository.addOption(category, scope, value, userId);
      onClose();
    } catch (e) {
      setError(
        e instanceof DuplicateLookupError
          ? e.message
          : e instanceof Error
            ? e.message
            : 'The option could not be added.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      title="Add an option"
      subtitle={groupTitle(category, scope)}
      icon={Plus}
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Add option'}
          </Button>
        </>
      }
    >
      <Field label="Option" required error={error || undefined}>
        <TextInput
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError('');
          }}
          placeholder="Type exactly how it should read in the dropdown"
          invalid={Boolean(error)}
          autoFocus
        />
      </Field>
      <p className="mt-3 text-xs text-ink-muted">
        It appears at the bottom of the list and can be moved up afterwards.
      </p>
    </Modal>
  );
}

function RenameOptionModal({ row, onClose }: { row: LookupValue; onClose: () => void }) {
  const [value, setValue] = useState(row.value);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const usage = useLiveQuery(() => lookupRepository.usageCount(row), [row.id]);

  async function save() {
    setSaving(true);
    try {
      await lookupRepository.renameOption(row.id, value);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The option could not be renamed.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      title="Rename option"
      subtitle={groupTitle(String(row.category), row.scope)}
      icon={Pencil}
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save name'}
          </Button>
        </>
      }
    >
      <Field label="Option" required error={error || undefined}>
        <TextInput
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError('');
          }}
          invalid={Boolean(error)}
          autoFocus
        />
      </Field>

      <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
        Records store the value itself, not a reference to this row — so renaming changes the label
        on everything that already uses it
        {usage != null && usage > 0
          ? ` (${usage} document${usage === 1 ? '' : 's'} today)`
          : ''}
        . That is what you want for a typo. To use the slot for something different, retire this one
        and add a new option instead.
      </p>
    </Modal>
  );
}
