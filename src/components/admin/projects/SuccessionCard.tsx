'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { GitFork } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Field, SelectInput, TextInput } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useMockSession } from '@/lib/auth/mock-session';
import { PROJECT_TYPES, type Project, type ProjectType } from '@/lib/db/types';
import { PROJECT_TYPE_HINT, PROJECT_TYPE_LABEL } from '@/lib/domain/project';
import { projectRepository } from '@/lib/repositories';

/** What each successor type means when it grows out of a share register. */
const SUCCESSOR_MEANING: Partial<Record<ProjectType, string>> = {
  apartment: 'The shareholders commission a building on the plot they now co-own.',
  commercial: 'The shareholders commission a commercial building.',
  mixed: 'The shareholders commission a mixed-use building.',
  plot_development: 'Partition (বাঁটোয়ারা) — the co-owners divide the land into plots.',
};

/**
 * Phase 3 — the land-share project, and what its buyers do next
 * (PROJECT-MODULE-PLAN.md §2.5).
 *
 * On a share register it lists the shareholders — read from the confirmed
 * bookings, never copied — and starts the successor project. On the successor
 * it names the share project it grew out of and the co-owners who commissioned
 * it, so nobody re-enters twenty buyers by hand. Renders nothing on a project
 * that is neither.
 */
export function SuccessionCard({ project }: { project: Project }) {
  const router = useRouter();
  const { userId } = useMockSession();
  const isRegister = project.project_type === 'land_share';
  const sourceId = isRegister ? project.id : (project.succeeds_project_id ?? null);

  const predecessor = useLiveQuery(
    () => (project.succeeds_project_id ? projectRepository.getById(project.succeeds_project_id) : undefined),
    [project.succeeds_project_id],
  );
  const holders = useLiveQuery(
    () => (sourceId ? projectRepository.shareholders(sourceId) : Promise.resolve([])),
    [sourceId],
  );
  const successors = useLiveQuery(
    () => (isRegister ? projectRepository.successorsOf(project.id) : Promise.resolve([])),
    [project.id, isRegister],
  );

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: '',
    project_type: 'apartment' as ProjectType,
    expected_start_date: '',
    expected_completion_date: '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!sourceId) return null;

  const heldPct = (holders ?? []).reduce((s, h) => s + h.share_pct, 0);
  const shares = (holders ?? []).reduce((s, h) => s + h.holdings, 0);
  const delivered = (holders ?? []).reduce((s, h) => s + h.delivered, 0);

  async function create() {
    setBusy(true);
    setError('');
    try {
      if (!form.expected_start_date || !form.expected_completion_date) {
        throw new Error('Enter the expected start and completion dates.');
      }
      const created = await projectRepository.startSuccessor(project.id, form, userId);
      router.push(`/admin/projects/${created.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start the project.');
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title={isRegister ? 'Shareholders' : 'Commissioned by shareholders'}
        action={
          isRegister ? (
            <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
              <GitFork className="size-4" /> Start successor project
            </Button>
          ) : undefined
        }
      />

      {!isRegister && predecessor && (
        <p className="mb-3 text-sm text-ink-muted">
          Grew out of{' '}
          <Link href={`/admin/projects/${predecessor.id}`} className="font-medium text-admin-700 hover:underline">
            {predecessor.name}
          </Link>{' '}
          — the co-owners of that plot commissioned this project.
        </p>
      )}

      {(holders ?? []).length === 0 ? (
        <p className="text-sm text-ink-muted">No share has been sold on a confirmed booking yet.</p>
      ) : (
        <>
          <p className="mb-2 text-xs text-ink-muted">
            {holders!.length} holder{holders!.length === 1 ? '' : 's'} · {shares} share
            {shares === 1 ? '' : 's'} · {Number(heldPct.toFixed(2))}% of the plot · {delivered} deed
            {delivered === 1 ? '' : 's'} registered
          </p>
          <ul className="divide-y divide-hairline">
            {holders!.map((h) => (
              <li key={h.customer.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <Link
                    href={`/admin/customers/${h.customer.id}`}
                    className="truncate text-sm font-medium text-ink hover:text-admin-700"
                  >
                    {h.customer.name}
                  </Link>
                  <p className="text-xs text-ink-muted">{h.unit_codes.join(', ')}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-sm text-ink">{Number(h.share_pct.toFixed(2))}%</span>
                  <Badge tone={h.delivered === h.holdings ? 'green' : 'amber'}>
                    {h.delivered === h.holdings ? 'Deed done' : 'Deed pending'}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {isRegister && (successors ?? []).length > 0 && (
        <div className="mt-3 border-t border-hairline pt-3">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-muted">Succeeded by</p>
          {successors!.map((p) => (
            <Link key={p.id} href={`/admin/projects/${p.id}`} className="block text-sm text-admin-700 hover:underline">
              {p.code} — {p.name} ({PROJECT_TYPE_LABEL[p.project_type]})
            </Link>
          ))}
        </div>
      )}

      {open && (
        <Modal
          open
          title="Start successor project"
          subtitle="A new project on the same land, commissioned by the shareholders"
          icon={GitFork}
          size="md"
          onClose={() => setOpen(false)}
          footer={
            <>
              <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
                Cancel
              </Button>
              <Button onClick={create} disabled={busy}>
                {busy ? 'Creating…' : 'Create project'}
              </Button>
            </>
          }
        >
          {delivered < shares && (
            <p className="mb-3 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800">
              {shares - delivered} of {shares} sold shares still have no registered deed. The co-owners
              usually commission construction once the register is settled.
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Project name" required className="sm:col-span-2">
              <TextInput
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Birulia Shareholders' Tower"
              />
            </Field>
            <Field
              label="What happens next"
              required
              className="sm:col-span-2"
              hint={SUCCESSOR_MEANING[form.project_type] ?? PROJECT_TYPE_HINT[form.project_type]}
            >
              <SelectInput
                value={form.project_type}
                onChange={(e) => setForm((f) => ({ ...f, project_type: e.target.value as ProjectType }))}
              >
                {PROJECT_TYPES.filter((t) => t !== 'land_share').map((t) => (
                  <option key={t} value={t}>
                    {PROJECT_TYPE_LABEL[t]}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Expected start" required>
              <TextInput
                type="date"
                value={form.expected_start_date}
                onChange={(e) => setForm((f) => ({ ...f, expected_start_date: e.target.value }))}
              />
            </Field>
            <Field label="Expected completion" required>
              <TextInput
                type="date"
                value={form.expected_completion_date}
                onChange={(e) => setForm((f) => ({ ...f, expected_completion_date: e.target.value }))}
              />
            </Field>
          </div>
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </Modal>
      )}
    </Card>
  );
}
