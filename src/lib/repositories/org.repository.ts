'use client';

import { db } from '../db/database';
import type { CommissionSaleKind, LookupValue, OrgMember, OrgMove } from '../db/types';
import { descendantsOf, nextPlainCode, wouldLoop } from '../domain/commission';
import { money } from '../domain/procurement';
import { todayLocal } from '../utils/format';
import { BaseRepository } from './base.repository';
import { lookupRepository } from './lookup.repository';

/*
 * The sales organisation (REVENUE-SHARE-PLAN.md §6): a free tree of members
 * under designations the client names and orders in Master Data. Moving a
 * member keeps the old place in `org_moves`, so commission is always worked
 * out from the tree as it was on the sale date.
 */

export const ORG_DESIGNATION = 'org_designation';

export interface OrgMemberInput {
  id?: string;
  name: string;
  phone?: string | null;
  designation_id: string;
  parent_id: string | null;
  user_id?: string | null;
  partner_id?: string | null;
  joined_on: string;
  notes?: string | null;
}

export interface OrgNode {
  member: OrgMember;
  designation: string;
  /** the designation's place in the list: 1 = the top */
  rank: number;
  user_name: string | null;
  partner_name: string | null;
  children: OrgNode[];
  /** everyone under this member, at any depth */
  team_size: number;
  own_sales: number;
  own_sales_count: number;
  /** this member's sales plus their whole team's */
  branch_sales: number;
  branch_sales_count: number;
}

/** A sale counts once it holds what was sold: not released, not cancelled. */
async function salesByMember(): Promise<Map<string, { amount: number; count: number }>> {
  const [shares, bookings] = await Promise.all([db.share_sales.toArray(), db.bookings.toArray()]);
  const out = new Map<string, { amount: number; count: number }>();
  const add = (id: string | null | undefined, amount: number) => {
    if (!id) return;
    const t = out.get(id) ?? { amount: 0, count: 0 };
    out.set(id, { amount: money(t.amount + amount), count: t.count + 1 });
  };
  for (const s of shares) if (s.status !== 'released' && s.status !== 'cancelled') add(s.sold_by_member_id, s.total_price);
  for (const b of bookings) if (b.status !== 'cancelled') add(b.sold_by_member_id, b.final_price);
  return out;
}

class OrgMemberRepository extends BaseRepository<OrgMember> {
  constructor() {
    super(() => db.org_members);
  }

  /** Active designations, top rank first. */
  async designations(): Promise<LookupValue[]> {
    return lookupRepository.options(ORG_DESIGNATION, null);
  }

  /** Every member, active first, then by designation rank and name. */
  async list(): Promise<OrgMember[]> {
    const [rows, des] = await Promise.all([db.org_members.toArray(), lookupRepository.listAll(ORG_DESIGNATION, null)]);
    const rank = new Map(des.map((d) => [d.id, d.sort_order]));
    return rows.sort(
      (a, b) =>
        Number(a.status === 'left') - Number(b.status === 'left') ||
        (rank.get(a.designation_id) ?? 99) - (rank.get(b.designation_id) ?? 99) ||
        a.name.localeCompare(b.name),
    );
  }

  /** Active members, for a "sold by" or "reports to" picker. */
  async options(): Promise<(OrgMember & { designation: string })[]> {
    const [rows, des] = await Promise.all([this.list(), lookupRepository.listAll(ORG_DESIGNATION, null)]);
    const label = new Map(des.map((d) => [d.id, d.value]));
    return rows.filter((m) => m.status === 'active').map((m) => ({ ...m, designation: label.get(m.designation_id) ?? '—' }));
  }

  /** The tree with team sizes and sales totals per branch (plan §6, org chart). */
  async tree(): Promise<OrgNode[]> {
    const [members, des, users, partners, sales] = await Promise.all([
      this.list(),
      lookupRepository.listAll(ORG_DESIGNATION, null),
      db.users.toArray(),
      db.partners.toArray(),
      salesByMember(),
    ]);
    const designation = new Map(des.map((d) => [d.id, d]));
    const userName = new Map(users.map((u) => [u.id, u.name]));
    const partnerName = new Map(partners.map((p) => [p.id, p.name]));
    const ids = new Set(members.map((m) => m.id));

    const build = (m: OrgMember, seen: Set<string>): OrgNode => {
      seen.add(m.id);
      const children = members.filter((c) => c.parent_id === m.id && !seen.has(c.id)).map((c) => build(c, seen));
      const own = sales.get(m.id) ?? { amount: 0, count: 0 };
      return {
        member: m,
        designation: designation.get(m.designation_id)?.value ?? '—',
        rank: designation.get(m.designation_id)?.sort_order ?? 99,
        user_name: m.user_id ? (userName.get(m.user_id) ?? null) : null,
        partner_name: m.partner_id ? (partnerName.get(m.partner_id) ?? null) : null,
        children,
        team_size: children.reduce((t, c) => t + 1 + c.team_size, 0),
        own_sales: own.amount,
        own_sales_count: own.count,
        branch_sales: money(own.amount + children.reduce((t, c) => t + c.branch_sales, 0)),
        branch_sales_count: own.count + children.reduce((t, c) => t + c.branch_sales_count, 0),
      };
    };
    const seen = new Set<string>();
    // a member whose parent is gone is shown at the top rather than lost
    return members.filter((m) => !m.parent_id || !ids.has(m.parent_id)).map((m) => build(m, seen));
  }

  async save(input: OrgMemberInput, userId: string | null): Promise<OrgMember> {
    const name = input.name.trim();
    if (!name) throw new Error('Enter the member’s name.');
    if (!input.designation_id || !(await db.lookup_values.get(input.designation_id))) throw new Error('Pick a designation.');
    if (!input.joined_on) throw new Error('Enter the day they joined.');
    const all = await db.org_members.toArray();
    if (input.parent_id) {
      const parent = all.find((m) => m.id === input.parent_id);
      if (!parent) throw new Error('The person they report to no longer exists.');
      if (parent.status === 'left') throw new Error(`${parent.name} has left; pick someone still in the team.`);
    }
    if (input.user_id && all.some((m) => m.id !== input.id && m.user_id === input.user_id && m.status === 'active')) {
      throw new Error('That login is already linked to another member.');
    }
    const payload = {
      name,
      phone: input.phone?.trim() || null,
      designation_id: input.designation_id,
      user_id: input.user_id || null,
      partner_id: input.partner_id || null,
      joined_on: input.joined_on,
      notes: input.notes?.trim() || null,
    };
    if (input.id) {
      const current = all.find((m) => m.id === input.id);
      if (!current) throw new Error('This member no longer exists.');
      // reporting lines change through a move, so the history is kept
      if ((input.parent_id ?? null) !== current.parent_id) await this.move(current.id, input.parent_id, todayLocal(), null, userId);
      return (await this.update(input.id, payload))!;
    }
    return this.create(
      { ...payload, code: nextPlainCode('ORG', all.map((m) => m.code)), parent_id: input.parent_id, left_on: null, status: 'active' },
      userId,
    );
  }

  /**
   * Puts a member under someone else from a date. The member's whole team
   * moves with them. Refused under their own team, which would make a loop.
   */
  async move(memberId: string, toParentId: string | null, effectiveDate: string, note: string | null, userId: string | null): Promise<void> {
    const all = await db.org_members.toArray();
    const m = all.find((x) => x.id === memberId);
    if (!m) throw new Error('This member no longer exists.');
    if (!effectiveDate) throw new Error('Enter the date the move takes effect.');
    if ((toParentId ?? null) === m.parent_id) throw new Error(`${m.name} already reports there.`);
    if (wouldLoop(memberId, toParentId, all)) throw new Error(`${m.name} cannot report to someone in their own team.`);
    const to = toParentId ? all.find((x) => x.id === toParentId) : null;
    if (toParentId && (!to || to.status === 'left')) throw new Error('Pick someone still in the team.');
    const last = (await db.org_moves.where('member_id').equals(memberId).toArray()).sort((a, b) => b.effective_date.localeCompare(a.effective_date))[0];
    if (last && effectiveDate < last.effective_date) throw new Error(`${m.name} last moved on ${last.effective_date}; a new move must be on or after it.`);
    await db.transaction('rw', db.org_members, db.org_moves, async () => {
      await orgMoveRepository.create({ member_id: memberId, from_parent_id: m.parent_id, to_parent_id: toParentId ?? null, effective_date: effectiveDate, note: note?.trim() || null }, userId);
      await this.update(memberId, { parent_id: toParentId ?? null });
    });
  }

  /** Marks a member as left. Their team has to be moved first, so nobody is left reporting to no one. */
  async markLeft(memberId: string, leftOn: string): Promise<void> {
    const all = await db.org_members.toArray();
    const m = all.find((x) => x.id === memberId);
    if (!m) throw new Error('This member no longer exists.');
    if (!leftOn) throw new Error('Enter the day they left.');
    if (leftOn < m.joined_on) throw new Error('They cannot leave before they joined.');
    const team = all.filter((x) => x.parent_id === memberId && x.status === 'active');
    if (team.length) throw new Error(`${team.length} ${team.length === 1 ? 'person reports' : 'people report'} to ${m.name}. Move them under someone else first.`);
    await this.update(memberId, { status: 'left', left_on: leftOn });
  }

  async rejoin(memberId: string): Promise<void> {
    await this.update(memberId, { status: 'active', left_on: null });
  }

  /** The member a staff login belongs to, if any — a booking's seller defaults from it. */
  async forUser(userId: string | null | undefined): Promise<OrgMember | undefined> {
    if (!userId) return undefined;
    return (await db.org_members.where('user_id').equals(userId).toArray()).find((m) => m.status === 'active');
  }

  /** Who reported where, newest first. */
  async history(memberId: string): Promise<OrgMove[]> {
    return (await db.org_moves.where('member_id').equals(memberId).toArray()).sort((a, b) => b.effective_date.localeCompare(a.effective_date));
  }

  /** Members under `memberId`, at any depth, by today's tree. */
  async teamIds(memberId: string): Promise<string[]> {
    return descendantsOf(memberId, await db.org_members.toArray());
  }

  /**
   * Who sold a share purchase or a booking. Once commission on it has been
   * earned, the seller is fixed: the lines already belong to someone.
   */
  async setSoldBy(kind: CommissionSaleKind, saleId: string, memberId: string | null): Promise<void> {
    if (memberId) {
      const m = await db.org_members.get(memberId);
      if (!m || m.status !== 'active') throw new Error('Pick a member still in the sales team.');
    }
    const lines = await (kind === 'share' ? db.commission_lines.where('share_sale_id') : db.commission_lines.where('booking_id')).equals(saleId).toArray();
    const seller = lines.find((l) => l.role === 'seller');
    if (seller && seller.member_id !== memberId && lines.some((l) => l.status !== 'pending')) {
      throw new Error('Commission on this sale has already been earned, so its seller cannot change.');
    }
    const changes = { sold_by_member_id: memberId, updated_at: new Date().toISOString() };
    if (kind === 'share') await db.share_sales.update(saleId, changes);
    else await db.bookings.update(saleId, changes);
  }
}

export const orgMemberRepository = new OrgMemberRepository();

class OrgMoveRepository extends BaseRepository<OrgMove> {
  constructor() {
    super(() => db.org_moves);
  }
}

export const orgMoveRepository = new OrgMoveRepository();
