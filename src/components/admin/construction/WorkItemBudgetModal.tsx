'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Calculator } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useMockSession } from '@/lib/auth/mock-session';
import type { TowerWorkItem } from '@/lib/db/types';
import { templateForItem } from '@/lib/domain/construction-cost';
import { actualByBudgetLine, workItemBudgetRepository } from '@/lib/repositories';
import { formatBdt } from '@/lib/utils/format';
import { BudgetLinesEditor, fromSaved, toBudgetInput, type EditorLine } from './BudgetLinesEditor';

/**
 * The budget of one work item (DIRECT-PURCHASE-PLAN.md B2, reshaped by the
 * client on 2026-10-21): the user types every figure. The kind of work only
 * suggests the items it normally needs, with their units; each line is
 * quantity × rate in its own unit, or a lump sum. Saved whole.
 */
export function WorkItemBudgetModal({
  workItem,
  onClose,
}: {
  workItem: TowerWorkItem;
  onClose: () => void;
}) {
  const { userId } = useMockSession();
  const existing = useLiveQuery(() => workItemBudgetRepository.listForWorkItem(workItem.id), [workItem.id]);
  const actuals = useLiveQuery(() => actualByBudgetLine(workItem.id), [workItem.id]);
  // null = untouched: show what is saved
  const [rows, setRows] = useState<EditorLine[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const shown = rows ?? (existing ?? []).map(fromSaved);

  async function save() {
    setError('');
    if (shown.some((l) => !l.description.trim())) return setError('Every line needs an item name.');
    setBusy(true);
    try {
      await workItemBudgetRepository.saveForWorkItem(workItem.id, shown.map(toBudgetInput), userId);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The budget could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  const unlined = actuals?.get('') ?? 0;

  return (
    <Modal
      open
      size="xl"
      icon={Calculator}
      title={`Budget · ${workItem.name}`}
      subtitle="What this work should cost. Costs recorded against it are compared line by line."
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy || existing === undefined}>
            {busy ? 'Saving…' : 'Save budget'}
          </Button>
        </>
      }
    >
      {existing === undefined ? (
        <p className="text-sm text-ink-muted">Loading…</p>
      ) : (
        <>
          <BudgetLinesEditor
            lines={shown}
            onChange={setRows}
            suggestions={templateForItem(workItem)}
            spent={actuals ?? new Map()}
          />
          {unlined > 0 && (
            <p className="mt-2 text-xs text-ink-muted">{formatBdt(unlined)} has been spent without naming a line.</p>
          )}
        </>
      )}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </Modal>
  );
}
