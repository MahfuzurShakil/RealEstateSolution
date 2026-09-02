'use client';

import { db } from '../db/database';
import type {
  Project,
  User,
  UserProjectAssignment,
  UserRole,
  UserStatus,
} from '../db/types';
import { hasAllProjectAccess } from '../domain/access';
import { SALES_ROLES } from '../domain/lead';
import { BaseRepository } from './base.repository';

/*
 * Users were created in Module 3 (leads had to be assigned to somebody) as a
 * read-only helper living inside `lead.repository.ts`. Module 8 owns the table
 * properly, so the class moved here and grew the rest of Section 9 —
 * `lead.repository.ts` now imports it rather than defining it, which keeps one
 * repository per table.
 */

export interface UserFilters {
  search?: string;
  role?: UserRole | 'all';
  status?: UserStatus | 'all';
}

export interface UserWithAccess extends User {
  /** projects from `user_project_assignments` (Section 9.5) */
  assigned_projects: Project[];
  /** true when the role sees everything regardless of the mapping */
  all_projects: boolean;
}

export class DuplicateUserError extends Error {
  constructor(readonly field: 'phone' | 'email') {
    super(`Another user already has this ${field}.`);
    this.name = 'DuplicateUserError';
  }
}

class UserRepository extends BaseRepository<User> {
  constructor() {
    super(() => db.users);
  }

  async listActive(): Promise<User[]> {
    const rows = await db.users.toArray();
    return rows
      .filter((u) => u.status === 'active')
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async listByRole(roles: UserRole[]): Promise<User[]> {
    return (await this.listActive()).filter((u) => roles.includes(u.role));
  }

  /** The people leads can be handed to (Section 4.7). */
  async salesTeam(): Promise<User[]> {
    return this.listByRole(SALES_ROLES);
  }

  /* --- Module 8 --- */

  async list(filters: UserFilters = {}): Promise<UserWithAccess[]> {
    const [users, assignments, projects] = await Promise.all([
      db.users.toArray(),
      db.user_project_assignments.toArray(),
      db.projects.toArray(),
    ]);
    const projectById = new Map(projects.map((p) => [p.id, p]));

    const byUser = new Map<string, Project[]>();
    for (const row of assignments) {
      const project = projectById.get(row.project_id);
      if (!project) continue;
      const list = byUser.get(row.user_id);
      if (list) list.push(project);
      else byUser.set(row.user_id, [project]);
    }

    let rows: UserWithAccess[] = users.map((user) => ({
      ...user,
      assigned_projects: (byUser.get(user.id) ?? []).sort((a, b) => a.name.localeCompare(b.name)),
      all_projects: hasAllProjectAccess(user.role),
    }));

    if (filters.role && filters.role !== 'all') rows = rows.filter((r) => r.role === filters.role);
    if (filters.status && filters.status !== 'all') {
      rows = rows.filter((r) => r.status === filters.status);
    }
    if (filters.search?.trim()) {
      const q = filters.search.trim().toLowerCase();
      rows = rows.filter((r) =>
        [r.name, r.phone, r.email].filter(Boolean).some((f) => String(f).toLowerCase().includes(q)),
      );
    }

    return rows.sort((a, b) => a.name.localeCompare(b.name));
  }

  /** `null` when the user is gone — distinct from a pending read. */
  async getWithAccess(id: string): Promise<UserWithAccess | null> {
    const user = await this.getById(id);
    if (!user) return null;
    const rows = await this.list();
    return rows.find((r) => r.id === id) ?? null;
  }

  /**
   * Phone and email are unique in the schema (Section 9.4), so a clash would
   * otherwise surface as a raw Dexie ConstraintError halfway through a save.
   * Checked here instead, and reported against the field that clashed.
   */
  private async assertUnique(
    input: { phone: string; email: string },
    exceptId?: string,
  ): Promise<void> {
    const users = await db.users.toArray();
    const others = users.filter((u) => u.id !== exceptId);
    const phone = input.phone.trim();
    const email = input.email.trim().toLowerCase();
    if (others.some((u) => u.phone.trim() === phone)) throw new DuplicateUserError('phone');
    if (others.some((u) => u.email.trim().toLowerCase() === email)) {
      throw new DuplicateUserError('email');
    }
  }

  async createUser(
    input: {
      name: string;
      phone: string;
      email: string;
      role: UserRole;
      status: UserStatus;
    },
    createdBy: string | null = null,
  ): Promise<User> {
    await this.assertUnique(input);
    return this.create(
      {
        name: input.name.trim(),
        phone: input.phone.trim(),
        email: input.email.trim(),
        // Phase A has no real auth (Section 0/9.4); Phase B replaces this with
        // a real hash set through an invite or reset flow, never typed here
        password_hash: 'phase-a-placeholder',
        role: input.role,
        status: input.status,
        last_login_at: null,
      },
      createdBy,
    );
  }

  async updateUser(
    id: string,
    input: { name: string; phone: string; email: string; role: UserRole; status: UserStatus },
  ): Promise<User | undefined> {
    await this.assertUnique(input, id);
    const previous = await this.getById(id);
    const updated = await this.update(id, {
      name: input.name.trim(),
      phone: input.phone.trim(),
      email: input.email.trim(),
      role: input.role,
      status: input.status,
    });

    /*
     * A role that sees every project has no use for a mapping, and leaving
     * stale rows behind would make the user page claim a restriction that is
     * not enforced. Cleared on the way in, not hidden at read time.
     */
    if (updated && hasAllProjectAccess(updated.role) && previous && !hasAllProjectAccess(previous.role)) {
      await userProjectAssignmentRepository.setForUser(id, []);
    }
    return updated;
  }

  async setStatus(id: string, status: UserStatus): Promise<User | undefined> {
    return this.update(id, { status });
  }

  /**
   * What a user is on the hook for. A person who has approved a discount or
   * logged site progress is referenced from records that would lose their
   * "who did this" if the row disappeared, so deletion is refused and the
   * account is deactivated instead.
   */
  async referenceCounts(id: string): Promise<{ total: number; detail: string[] }> {
    const [leads, bookings, updates, requests, payments, expenses] = await Promise.all([
      db.leads.where('assigned_to').equals(id).count(),
      db.bookings.where('booked_by').equals(id).count(),
      db.site_progress_updates.where('updated_by').equals(id).count(),
      db.material_requests.where('requested_by').equals(id).count(),
      db.payments.where('received_by').equals(id).count(),
      db.expenses.where('paid_by').equals(id).count(),
    ]);

    const detail: string[] = [];
    if (leads) detail.push(`${leads} lead${leads === 1 ? '' : 's'}`);
    if (bookings) detail.push(`${bookings} booking${bookings === 1 ? '' : 's'}`);
    if (updates) detail.push(`${updates} progress update${updates === 1 ? '' : 's'}`);
    if (requests) detail.push(`${requests} material request${requests === 1 ? '' : 's'}`);
    if (payments) detail.push(`${payments} payment${payments === 1 ? '' : 's'}`);
    if (expenses) detail.push(`${expenses} expense${expenses === 1 ? '' : 's'}`);

    return { total: leads + bookings + updates + requests + payments + expenses, detail };
  }

  async removeCascade(id: string): Promise<void> {
    await userProjectAssignmentRepository.setForUser(id, []);
    await this.remove(id);
  }

  async countByRole(): Promise<Record<string, number>> {
    const rows = await db.users.toArray();
    return rows.reduce<Record<string, number>>((acc, u) => {
      acc[u.role] = (acc[u.role] ?? 0) + 1;
      return acc;
    }, {});
  }
}

/** Project-level scoping (Section 9.5). */
class UserProjectAssignmentRepository extends BaseRepository<UserProjectAssignment> {
  constructor() {
    super(() => db.user_project_assignments);
  }

  async listForUser(userId: string): Promise<UserProjectAssignment[]> {
    return db.user_project_assignments.where('user_id').equals(userId).toArray();
  }

  async projectIdsForUser(userId: string): Promise<string[]> {
    return (await this.listForUser(userId)).map((r) => r.project_id);
  }

  async listForProject(projectId: string): Promise<UserProjectAssignment[]> {
    return db.user_project_assignments.where('project_id').equals(projectId).toArray();
  }

  /** Replaces a user's assignments with exactly this set. */
  async setForUser(
    userId: string,
    projectIds: string[],
    createdBy: string | null = null,
  ): Promise<void> {
    const existing = await this.listForUser(userId);
    const wanted = new Set(projectIds);
    const have = new Set(existing.map((r) => r.project_id));

    for (const row of existing) {
      if (!wanted.has(row.project_id)) await this.remove(row.id);
    }
    for (const projectId of projectIds) {
      if (!have.has(projectId)) await this.create({ user_id: userId, project_id: projectId }, createdBy);
    }
  }

  async removeForProject(projectId: string): Promise<void> {
    const rows = await this.listForProject(projectId);
    await db.user_project_assignments.bulkDelete(rows.map((r) => r.id));
  }

  /**
   * The projects one user may work on — `null` for the roles that see
   * everything (Section 9.5). Callers must keep `null` and `[]` apart: the
   * first is "no restriction", the second is "nothing at all".
   */
  async scopeFor(userId: string): Promise<string[] | null> {
    const user = await db.users.get(userId);
    if (!user) return [];
    if (hasAllProjectAccess(user.role)) return null;
    return this.projectIdsForUser(userId);
  }
}

export const userRepository = new UserRepository();
export const userProjectAssignmentRepository = new UserProjectAssignmentRepository();
