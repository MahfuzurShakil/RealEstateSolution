'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CalendarClock, MessageSquarePlus, PhoneCall } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field, SelectInput, TextArea, TextInput } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useMockSession } from '@/lib/auth/mock-session';
import type { LeadActivity, LeadActivityType } from '@/lib/db/types';
import {
  FOLLOW_UP_META,
  LEAD_ACTIVITY_META,
  MANUAL_ACTIVITY_TYPES,
  followUpState,
} from '@/lib/domain/lead';
import { leadActivityRepository } from '@/lib/repositories';
import { formatDate, todayLocal } from '@/lib/utils/format';

function formatDateTime(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
}

/** Follow-up log for one lead (Section 4.4) — the trail plus a "log" action. */
export function LeadActivityPanel({ leadId }: { leadId: string }) {
  const { userId } = useMockSession();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<LeadActivityType>('call');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState(todayLocal());
  const [followUp, setFollowUp] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const activities = useLiveQuery(() => leadActivityRepository.listForLead(leadId), [leadId]);
  const today = todayLocal();

  function openDialog() {
    setType('call');
    setNotes('');
    setDate(todayLocal());
    setFollowUp('');
    setError('');
    setOpen(true);
  }

  async function save() {
    if (!notes.trim()) return setError('Write what happened');
    setSaving(true);
    try {
      await leadActivityRepository.log(
        leadId,
        {
          activity_type: type,
          notes: notes.trim(),
          // stored as a timestamp; the picker only takes the day
          activity_date: new Date(`${date}T12:00:00`).toISOString(),
          next_follow_up_date: followUp || null,
        },
        userId,
      );
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">
          {activities === undefined
            ? 'Loading…'
            : `${activities.length} entr${activities.length === 1 ? 'y' : 'ies'}`}
        </p>
        <Button size="sm" onClick={openDialog}>
          <MessageSquarePlus className="size-4" /> Log activity
        </Button>
      </div>

      {activities === undefined ? (
        <p className="text-sm text-ink-muted">Loading…</p>
      ) : activities.length === 0 ? (
        <EmptyState
          icon={PhoneCall}
          title="No follow-up logged yet"
          description="Every call, WhatsApp message and site visit goes here — it is what the next person picks the conversation up from."
          action={
            <Button onClick={openDialog}>
              <MessageSquarePlus className="size-4" /> Log activity
            </Button>
          }
        />
      ) : (
        <ol className="relative space-y-4 pl-8">
          <span className="absolute bottom-3 left-[11px] top-3 w-px bg-hairline" aria-hidden />
          {[...activities].reverse().map((activity: LeadActivity, index) => {
            const meta = LEAD_ACTIVITY_META[activity.activity_type];
            const state = followUpState(activity.next_follow_up_date, today);
            return (
              <li key={activity.id} className="relative">
                <span
                  className={`absolute -left-8 top-3 grid size-6 place-items-center rounded-full text-[10px] font-semibold ring-4 ring-white ${
                    index === 0 ? 'bg-admin-500 text-white' : 'bg-admin-100 text-admin-700'
                  }`}
                >
                  {activities.length - index}
                </span>

                <div className="rounded-xl border border-hairline bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Badge tone={meta.tone}>{meta.label}</Badge>
                    <span className="text-xs font-medium text-ink">
                      {formatDateTime(activity.activity_date)}
                    </span>
                  </div>

                  <p className="mt-3 whitespace-pre-wrap text-sm text-ink">{activity.notes}</p>

                  {activity.next_follow_up_date && (
                    <p className="mt-3 flex flex-wrap items-center gap-2 border-t border-hairline pt-3 text-xs text-ink-muted">
                      <CalendarClock className="size-3.5" />
                      Next follow-up {formatDate(activity.next_follow_up_date)}
                      {/* only the newest entry's date is still live */}
                      {index === 0 && state !== 'none' && (
                        <Badge tone={FOLLOW_UP_META[state].tone}>{FOLLOW_UP_META[state].label}</Badge>
                      )}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <Modal
        open={open}
        title="Log activity"
        subtitle="Call, WhatsApp, visit — whatever just happened"
        icon={MessageSquarePlus}
        size="md"
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save activity'}
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Activity type" required>
            <SelectInput
              value={type}
              onChange={(e) => setType(e.target.value as LeadActivityType)}
            >
              {MANUAL_ACTIVITY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {LEAD_ACTIVITY_META[t].label}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Happened on" required>
            <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Notes" required error={error || undefined} className="sm:col-span-2">
            <TextArea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What was discussed, what did they ask for, what did you promise…"
              invalid={Boolean(error)}
            />
          </Field>
          <Field
            label="Next follow-up"
            className="sm:col-span-2"
            hint="Leave empty if nothing is pending. The newest date is the one the task list uses."
          >
            <TextInput
              type="date"
              min={todayLocal()}
              value={followUp}
              onChange={(e) => setFollowUp(e.target.value)}
            />
          </Field>
        </div>
      </Modal>
    </>
  );
}
