'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Database, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useMockSession } from '@/lib/auth/mock-session';
import { clearDemoData, resetDemoData } from '@/lib/db/demo-seed';
import { landRepository } from '@/lib/repositories';

/**
 * Lets the demo be reset or emptied on purpose. Sample data loads itself on a
 * fresh database; clearing it here also stops it coming back on reload.
 */
export function DemoDataCard() {
  const { userId } = useMockSession();
  const [action, setAction] = useState<'reset' | 'clear' | null>(null);
  const [busy, setBusy] = useState(false);

  const landCount = useLiveQuery(() => landRepository.count(), []);

  async function run() {
    setBusy(true);
    try {
      if (action === 'reset') await resetDemoData(userId);
      if (action === 'clear') await clearDemoData();
      setAction(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Card>
        <CardHeader title="Demo data" />
        <p className="text-sm text-ink-muted">
          {landCount === 0
            ? 'All records have been cleared. Reload the sample dataset to explore the modules with realistic records.'
            : 'This install is preloaded with sample Bangladeshi records — every pipeline status, both acquisition types, towers with generated units, bookings waiting on a discount approval, and a construction log with towers running ahead of and behind plan.'}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setAction('reset')}>
            <RefreshCw className="size-4" /> Reload sample data
          </Button>
          {landCount !== 0 && (
            <Button variant="ghost" size="sm" onClick={() => setAction('clear')}>
              <Trash2 className="size-4" /> Clear all records
            </Button>
          )}
        </div>
      </Card>

      <ConfirmDialog
        open={action !== null}
        icon={Database}
        tone={action === 'clear' ? 'danger' : 'warning'}
        title={action === 'clear' ? 'Clear all records' : 'Reload sample data'}
        subtitle="Modules 1–5 — Land, Projects, Leads, Bookings and Site Progress"
        message={
          action === 'clear'
            ? 'Every land, landowner, JV term, pipeline entry and uploaded document will be deleted from this browser. Master data and company settings stay.'
            : 'This deletes the current land records and loads the sample dataset again. Anything you added yourself will be lost.'
        }
        confirmLabel={action === 'clear' ? 'Clear everything' : 'Reload sample data'}
        busy={busy}
        onCancel={() => setAction(null)}
        onConfirm={run}
      />
    </>
  );
}
