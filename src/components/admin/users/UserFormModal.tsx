'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { UserCog } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Checkbox, Field, SelectInput, TextInput } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useMockSession } from '@/lib/auth/mock-session';
import {
  USER_ROLES,
  USER_STATUSES,
  type User,
  type UserRole,
  type UserStatus,
} from '@/lib/db/types';
import { USER_ROLE_META, USER_STATUS_META, hasAllProjectAccess } from '@/lib/domain/access';
import {
  DuplicateUserError,
  projectRepository,
  userProjectAssignmentRepository,
  userRepository,
} from '@/lib/repositories';

/**
 * Create or edit a staff account (Section 9.4) together with its project
 * scoping (9.5).
 *
 * The two are one dialog on purpose: a `site_manager` saved without any
 * assignment can see nothing at all, and a two-step flow is how somebody ends
 * up with an account that silently does not work.
 */
export function UserFormModal({
  open,
  user,
  onClose,
  onSaved,
}: {
  open: boolean;
  user?: User;
  onClose: () => void;
  onSaved: (user: User) => void;
}) {
  if (!open) return null;
  return <UserDialog key={user?.id ?? 'new'} user={user} onClose={onClose} onSaved={onSaved} />;
}

function UserDialog({
  user,
  onClose,
  onSaved,
}: {
  user?: User;
  onClose: () => void;
  onSaved: (user: User) => void;
}) {
  const { userId } = useMockSession();
  const [form, setForm] = useState({
    name: user?.name ?? '',
    phone: user?.phone ?? '',
    email: user?.email ?? '',
    role: (user?.role ?? 'sales_executive') as UserRole,
    status: (user?.status ?? 'active') as UserStatus,
  });
  const [errors, setErrors] = useState<{
    name?: string;
    phone?: string;
    email?: string;
  }>({});
  const [saving, setSaving] = useState(false);

  const projects = useLiveQuery(() => projectRepository.list(), []);
  const assigned = useLiveQuery(
    () => (user ? userProjectAssignmentRepository.projectIdsForUser(user.id) : Promise.resolve([])),
    [user?.id],
  );

  /*
   * `null` means "not touched yet", so the saved assignments show through
   * while they are still loading and the first render does not blank them.
   */
  const [picked, setPicked] = useState<string[] | null>(null);
  const selected = picked ?? assigned ?? [];

  const set = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }));
  const unscoped = hasAllProjectAccess(form.role);
  const roleMeta = USER_ROLE_META[form.role];

  function toggleProject(id: string) {
    const next = selected.includes(id) ? selected.filter((p) => p !== id) : [...selected, id];
    setPicked(next);
  }

  async function save() {
    const next: typeof errors = {};
    if (!form.name.trim()) next.name = 'Name is required';
    if (!form.phone.trim()) next.phone = 'Phone is required';
    if (!form.email.trim()) next.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      next.email = 'That does not look like an email address';
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSaving(true);
    try {
      const saved = user
        ? ((await userRepository.updateUser(user.id, form)) as User)
        : await userRepository.createUser(form, userId);

      // an unscoped role keeps no mapping — the repository clears it too, but
      // saving an empty set here keeps the dialog honest about what it wrote
      await userProjectAssignmentRepository.setForUser(
        saved.id,
        unscoped ? [] : selected,
        userId,
      );
      onSaved(saved);
    } catch (e) {
      if (e instanceof DuplicateUserError) {
        setErrors({ [e.field]: `Another user already has this ${e.field}` });
        return;
      }
      throw e;
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      title={user ? `Edit ${user.name}` : 'New User'}
      subtitle="Role decides what they can open; assignment decides which projects"
      icon={UserCog}
      size="md"
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? 'Saving…' : user ? 'Save changes' : 'Create user'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" required error={errors.name} className="sm:col-span-2">
          <TextInput
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="e.g. Jahangir Alam"
            invalid={Boolean(errors.name)}
            autoFocus
          />
        </Field>

        <Field label="Phone" required error={errors.phone}>
          <TextInput
            value={form.phone}
            onChange={(e) => set('phone', e.target.value)}
            placeholder="e.g. 01720 334455"
            invalid={Boolean(errors.phone)}
          />
        </Field>

        <Field label="Email" required error={errors.email}>
          <TextInput
            type="email"
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
            placeholder="name@nokshiproperties.com.bd"
            invalid={Boolean(errors.email)}
          />
        </Field>

        <Field label="Role" required>
          <SelectInput value={form.role} onChange={(e) => set('role', e.target.value)}>
            {USER_ROLES.map((r) => (
              <option key={r} value={r}>
                {USER_ROLE_META[r].label}
              </option>
            ))}
          </SelectInput>
        </Field>

        <Field
          label="Status"
          required
          hint="Inactive keeps the record and their history, but they cannot be assigned new work"
        >
          <SelectInput value={form.status} onChange={(e) => set('status', e.target.value)}>
            {USER_STATUSES.map((st) => (
              <option key={st} value={st}>
                {USER_STATUS_META[st].label}
              </option>
            ))}
          </SelectInput>
        </Field>
      </div>

      <p className="mt-4 rounded-xl border border-hairline bg-white p-3 text-xs text-ink-muted">
        <Badge tone={roleMeta.tone} className="mr-1.5">
          {roleMeta.label}
        </Badge>
        {roleMeta.description}
      </p>

      <div className="mt-4">
        <p className="mb-2 text-sm font-medium text-ink">Project access</p>

        {unscoped ? (
          <p className="rounded-xl border border-hairline bg-white p-3 text-xs text-ink-muted">
            {roleMeta.label} sees every project without any assignment (Section 9.5), so there is
            nothing to pick here. Any assignment saved earlier is cleared, because leaving it would
            suggest a restriction that is not applied.
          </p>
        ) : (
          <>
            <div className="space-y-2 rounded-xl border border-hairline bg-white p-3">
              {(projects ?? []).length === 0 ? (
                <p className="text-xs text-ink-muted">No project exists yet.</p>
              ) : (
                (projects ?? []).map((project) => (
                  <Checkbox
                    key={project.id}
                    label={`${project.name} · ${project.code}`}
                    checked={selected.includes(project.id)}
                    onChange={() => toggleProject(project.id)}
                  />
                ))
              )}
            </div>

            {selected.length === 0 && (
              <p className="mt-2 text-xs text-amber-700">
                With no project assigned, this account can open its screens but will find nothing on
                them — the mapping is an allow-list, not a filter (Section 9.5).
              </p>
            )}
          </>
        )}
      </div>

      {!user && (
        <p className="mt-4 text-xs text-ink-muted">
          Phase A has no sign-in (Section 0), so no password is set here. Phase B sends an invite
          and the person sets their own — a password typed in by an admin is one that two people
          know.
        </p>
      )}
    </Modal>
  );
}
