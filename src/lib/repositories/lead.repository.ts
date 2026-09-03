'use client';

import { db } from '../db/database';
import type {
  Lead,
  LeadActivity,
  LeadActivityType,
  LeadSource,
  LeadStatus,
  Project,
  Unit,
  User,
} from '../db/types';
import { LEAD_STATUS_META } from '../domain/lead';
import { nextCode, nowIso } from '../utils/id';
import { BaseRepository, type NewRecord } from './base.repository';
import { documentRepository } from './document.repository';

/** Phone digits only — "01711 22 33 44" and "+8801711223344" are one buyer. */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  // BD numbers arrive as 01711…, 8801711…, or +8801711…
  if (digits.startsWith('880')) return `0${digits.slice(3)}`;
  if (digits.length === 10 && !digits.startsWith('0')) return `0${digits}`;
  return digits;
}

export interface LeadFilters {
  search?: string;
  status?: LeadStatus | 'all';
  source?: LeadSource | 'all';
  assigned_to?: string | 'all' | 'unassigned';
  interested_project_id?: string;
  /** narrows to the daily task list */
  follow_up?: 'overdue' | 'today' | 'all';
}

/** A lead plus what the detail page shows around it. */
export interface LeadWithRelations extends Lead {
  assignee: User | undefined;
  project: Project | undefined;
  unit: Unit | undefined;
  activities: LeadActivity[];
  /** the open follow-up date, or null once the lead is booked or lost */
  next_follow_up: string | null;
}

export interface DedupResult {
  /** true when an existing lead absorbed the inquiry instead of a new row */
  merged: boolean;
  lead: Lead;
}

class LeadRepository extends BaseRepository<Lead> {
  constructor() {
    super(() => db.leads);
  }

  async generateCode(): Promise<string> {
    const codes = (await db.leads.toArray()).map((l) => l.code);
    return nextCode('LEAD', codes);
  }

  /** Existing lead with this phone, if any (Section 4.5 dedup key). */
  async findByPhone(phone: string): Promise<Lead | undefined> {
    const normalized = normalizePhone(phone);
    return (await db.leads.toArray()).find((l) => normalizePhone(l.phone) === normalized);
  }

  async create(input: NewRecord<Lead>, createdBy: string | null = null): Promise<Lead> {
    const code = input.code?.trim() ? input.code : await this.generateCode();
    return super.create({ ...input, code, phone: normalizePhone(input.phone) }, createdBy);
  }

  /**
   * The single entry point for a new inquiry, from the admin form or the public
   * website (Section 4.5 / 4.9). Phone is looked up first: on a match the
   * existing lead absorbs the inquiry as an activity and no duplicate row is
   * created; otherwise a new lead is opened at `new`.
   */
  async captureInquiry(
    input: {
      name: string;
      phone: string;
      email?: string | null;
      source: LeadSource;
      inquiry_message?: string | null;
      interested_project_id?: string | null;
      interested_unit_id?: string | null;
      budget_range?: string | null;
      assigned_to?: string | null;
    },
    createdBy: string | null = null,
  ): Promise<DedupResult> {
    const existing = await this.findByPhone(input.phone);

    if (existing) {
      await leadActivityRepository.create(
        {
          lead_id: existing.id,
          activity_type: 'other',
          activity_date: nowIso(),
          next_follow_up_date: null,
          notes: [
            `Repeat inquiry via ${input.source.replace(/_/g, ' ')} under the name "${input.name}".`,
            input.inquiry_message?.trim(),
          ]
            .filter(Boolean)
            .join(' ')
            .trim(),
        },
        createdBy,
      );
      return { merged: true, lead: existing };
    }

    const lead = await this.create(
      {
        code: '',
        name: input.name,
        phone: input.phone,
        email: input.email ?? null,
        source: input.source,
        inquiry_message: input.inquiry_message ?? null,
        interested_project_id: input.interested_project_id ?? null,
        interested_unit_id: input.interested_unit_id ?? null,
        budget_range: input.budget_range ?? null,
        assigned_to: input.assigned_to ?? null,
        status: 'new',
        lost_reason: null,
      },
      createdBy,
    );
    return { merged: false, lead };
  }

  async list(filters: LeadFilters = {}, today = ''): Promise<Lead[]> {
    const { search, status, source, assigned_to, interested_project_id, follow_up } = filters;
    let rows = await db.leads.toArray();

    if (status && status !== 'all') rows = rows.filter((l) => l.status === status);
    if (source && source !== 'all') rows = rows.filter((l) => l.source === source);
    if (assigned_to === 'unassigned') rows = rows.filter((l) => !l.assigned_to);
    else if (assigned_to && assigned_to !== 'all') {
      rows = rows.filter((l) => l.assigned_to === assigned_to);
    }
    if (interested_project_id) {
      rows = rows.filter((l) => l.interested_project_id === interested_project_id);
    }
    if (search?.trim()) {
      const q = search.trim().toLowerCase();
      const qPhone = normalizePhone(search);
      rows = rows.filter(
        (l) =>
          [l.code, l.name, l.email, l.budget_range]
            .filter(Boolean)
            .some((f) => String(f).toLowerCase().includes(q)) ||
          (qPhone.length >= 3 && normalizePhone(l.phone).includes(qPhone)),
      );
    }

    if (follow_up && follow_up !== 'all' && today) {
      const due = await this.followUpDueMap();
      rows = rows.filter((l) => {
        const date = due.get(l.id);
        if (!date) return false;
        return follow_up === 'overdue' ? date < today : date === today;
      });
    }

    return rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  /**
   * The open follow-up date per lead: the latest one recorded, since a newer
   * activity supersedes the date the previous one set. Closed leads are left
   * out — nobody follows up a booked or lost lead.
   */
  async followUpDueMap(): Promise<Map<string, string>> {
    const leads = await db.leads.toArray();
    const activities = await db.lead_activities.toArray();
    const map = new Map<string, string>();

    for (const lead of leads) {
      if (lead.status === 'booked' || lead.status === 'lost') continue;
      const latest = activities
        .filter((a) => a.lead_id === lead.id)
        .sort((a, b) => a.activity_date.localeCompare(b.activity_date))
        .at(-1);
      if (latest?.next_follow_up_date) map.set(lead.id, latest.next_follow_up_date);
    }
    return map;
  }

  /** Daily task list (Section 4.4) — overdue first, then today's. */
  /**
   * Who the sales desk has to call today.
   *
   * Leads that already have a live booking are left out. A lead only flips to
   * `booked` when the booking is *confirmed*, so one sitting at
   * `pending_approval` kept its old status and stayed on this queue — the desk
   * was being told to chase a buyer who had already paid his booking money and
   * was waiting on the sales manager's signature. Lost leads are out for the
   * obvious reason.
   */
  async followUpQueue(today: string): Promise<Array<{ lead: Lead; date: string }>> {
    const [due, leads, bookings] = await Promise.all([
      this.followUpDueMap(),
      db.leads.toArray(),
      db.bookings.toArray(),
    ]);

    const withLiveBooking = new Set(
      bookings
        .filter((b) => b.status !== 'cancelled' && b.lead_id)
        .map((b) => b.lead_id as string),
    );

    return leads
      .flatMap((lead) => {
        if (lead.status === 'booked' || lead.status === 'lost') return [];
        if (withLiveBooking.has(lead.id)) return [];
        const date = due.get(lead.id);
        return date && date <= today ? [{ lead, date }] : [];
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  /*
   * `null`, not `undefined`, when the record is gone. `useLiveQuery` reports
   * its own pending state as `undefined`, so a repository returning
   * `undefined` for "no such row" leaves the detail page unable to tell a
   * deleted record from a query still in flight — it sat on "Loading…"
   * forever instead of saying the record no longer exists.
   */
  async getWithRelations(id: string): Promise<LeadWithRelations | null> {
    const lead = await this.getById(id);
    if (!lead) return null;

    const activities = await leadActivityRepository.listForLead(id);
    const latest = activities.at(-1);

    return {
      ...lead,
      assignee: lead.assigned_to ? await db.users.get(lead.assigned_to) : undefined,
      project: lead.interested_project_id
        ? await db.projects.get(lead.interested_project_id)
        : undefined,
      unit: lead.interested_unit_id ? await db.units.get(lead.interested_unit_id) : undefined,
      activities,
      next_follow_up:
        lead.status === 'booked' || lead.status === 'lost'
          ? null
          : (latest?.next_follow_up_date ?? null),
    };
  }

  /**
   * Moves the lead and logs the move as a `status_change` activity, so the
   * record never changes silently (Section 4.6 — a revive keeps its history and
   * needs no separate flag).
   */
  async setStatus(
    id: string,
    status: LeadStatus,
    options: { notes: string; next_follow_up_date?: string | null },
    createdBy: string | null = null,
  ): Promise<Lead | undefined> {
    const current = await this.getById(id);
    if (!current) return undefined;

    const from = LEAD_STATUS_META[current.status].label;
    const to = LEAD_STATUS_META[status].label;

    await leadActivityRepository.create(
      {
        lead_id: id,
        activity_type: 'status_change',
        activity_date: nowIso(),
        next_follow_up_date: options.next_follow_up_date || null,
        notes: `${from} → ${to}${options.notes.trim() ? `. ${options.notes.trim()}` : ''}`,
      },
      createdBy,
    );

    return this.update(id, {
      status,
      // the reason belongs to the lost state only; reviving clears it
      lost_reason: status === 'lost' ? options.notes.trim() : null,
    });
  }

  /** Manual assignment (Section 4.7), logged like any other change. */
  async assign(id: string, userId: string | null, createdBy: string | null = null): Promise<void> {
    const user = userId ? await db.users.get(userId) : undefined;
    await leadActivityRepository.create(
      {
        lead_id: id,
        activity_type: 'status_change',
        activity_date: nowIso(),
        next_follow_up_date: null,
        notes: user ? `Assigned to ${user.name}.` : 'Assignment cleared.',
      },
      createdBy,
    );
    await this.update(id, { assigned_to: userId });
  }

  async countByStatus(): Promise<Record<string, number>> {
    const rows = await db.leads.toArray();
    return rows.reduce<Record<string, number>>((acc, l) => {
      acc[l.status] = (acc[l.status] ?? 0) + 1;
      return acc;
    }, {});
  }

  /** Leads attached to a project — shown on the project detail page. */
  async listForProject(projectId: string): Promise<Lead[]> {
    const rows = await db.leads.where('interested_project_id').equals(projectId).toArray();
    return rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  async removeCascade(id: string): Promise<void> {
    const activities = await db.lead_activities.where('lead_id').equals(id).toArray();
    await db.lead_activities.bulkDelete(activities.map((a) => a.id));
    await documentRepository.removeForEntity('lead', id);
    await this.remove(id);
  }
}

class LeadActivityRepository extends BaseRepository<LeadActivity> {
  constructor() {
    super(() => db.lead_activities);
  }

  /** Oldest first — this is a conversation log. */
  async listForLead(leadId: string): Promise<LeadActivity[]> {
    const rows = await db.lead_activities.where('lead_id').equals(leadId).toArray();
    return rows.sort((a, b) => a.activity_date.localeCompare(b.activity_date));
  }

  async countForLead(leadId: string): Promise<number> {
    return db.lead_activities.where('lead_id').equals(leadId).count();
  }

  async log(
    leadId: string,
    input: {
      activity_type: LeadActivityType;
      notes: string;
      activity_date: string;
      next_follow_up_date?: string | null;
    },
    createdBy: string | null = null,
  ): Promise<LeadActivity> {
    return this.create(
      {
        lead_id: leadId,
        activity_type: input.activity_type,
        notes: input.notes,
        activity_date: input.activity_date,
        next_follow_up_date: input.next_follow_up_date || null,
      },
      createdBy,
    );
  }
}

/**
 * Users (Section 9.4). Module 8 will add the management screens; for now this
 * is read-mostly, so Module 3 can assign leads to real Sales Executives.
 */
export const leadRepository = new LeadRepository();
export const leadActivityRepository = new LeadActivityRepository();

/*
 * `userRepository` used to be defined here — leads needed somebody to be
 * assigned to, and Module 3 arrived long before Module 8. It now lives in
 * `user.repository.ts`, which owns the table properly. Re-exported so nothing
 * that already imports it from the lead layer has to change.
 */
