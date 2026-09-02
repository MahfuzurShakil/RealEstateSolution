import type { BadgeTone } from '@/components/ui/Badge';
import type { UserRole, UserStatus } from '@/lib/db/types';

/* ------------------------------------------------------------------ *
 * Roles (Section 9.3)
 * ------------------------------------------------------------------ */

export const USER_ROLE_META: Record<
  UserRole,
  { label: string; tone: BadgeTone; description: string }
> = {
  super_admin: {
    label: 'Super Admin',
    tone: 'teal',
    description: 'Everything, including users, master data and company settings.',
  },
  management: {
    label: 'Management',
    tone: 'blue',
    description: 'Sees the whole business but changes nothing operational.',
  },
  land_team: {
    label: 'Land Team',
    tone: 'green',
    description: 'Owns land acquisition end to end; reads projects.',
  },
  project_manager: {
    label: 'Project Manager',
    tone: 'amber',
    description: 'Runs their assigned projects — towers, units, site progress.',
  },
  sales_executive: {
    label: 'Sales Executive',
    tone: 'blue',
    description: 'Their own leads and bookings only.',
  },
  sales_manager: {
    label: 'Sales Manager',
    tone: 'blue',
    description: 'The whole sales pipeline, including discount approval.',
  },
  head_of_sales: {
    label: 'Head of Sales',
    tone: 'blue',
    description: 'Sales leadership — same reach as a sales manager.',
  },
  site_manager: {
    label: 'Site Manager',
    tone: 'amber',
    description: 'Progress and material requests on their assigned sites.',
  },
  procurement: {
    label: 'Procurement',
    tone: 'teal',
    description: 'Purchase orders, goods receipts, stock and supplier payments.',
  },
  accounts: {
    label: 'Accounts',
    tone: 'green',
    description: 'Collections, the cost ledger and supplier payments.',
  },
};

export const USER_STATUS_META: Record<UserStatus, { label: string; tone: BadgeTone }> = {
  active: { label: 'Active', tone: 'green' },
  inactive: { label: 'Inactive', tone: 'neutral' },
};

/* ------------------------------------------------------------------ *
 * Permission matrix (Section 9.6)
 * ------------------------------------------------------------------ */

/**
 * What a role may do in a module.
 *
 *   full     — create, edit, delete
 *   approve  — act on the workflow (approve/decide) without owning the records
 *   create   — raise records, but not decide on them
 *   view     — read only
 *   own      — read and act on records they created or were assigned
 *   none     — the module is not theirs; it is hidden
 *
 * `scoped` means the reach is limited to the projects in
 * `user_project_assignments` (Section 9.5).
 */
export type AccessLevel = 'full' | 'approve' | 'create' | 'view' | 'own' | 'none';

export interface Permission {
  level: AccessLevel;
  scoped?: boolean;
}

export const ACCESS_LEVEL_LABEL: Record<AccessLevel, string> = {
  full: 'Full',
  approve: 'Approve',
  create: 'Create',
  view: 'View',
  own: 'Own only',
  none: '—',
};

export const ACCESS_LEVEL_TONE: Record<AccessLevel, BadgeTone> = {
  full: 'green',
  approve: 'teal',
  create: 'blue',
  view: 'neutral',
  own: 'amber',
  none: 'neutral',
};

export const MODULE_KEYS = [
  'land',
  'project',
  'crm',
  'booking',
  'site_progress',
  'material_request',
  'procurement',
  'supplier_voucher',
  'finance_collection',
  'finance_expense',
  'dashboard',
  'master_data',
  'user_management',
] as const;
export type ModuleKey = (typeof MODULE_KEYS)[number];

export const MODULE_LABEL: Record<ModuleKey, string> = {
  land: 'Land',
  project: 'Project / Tower / Unit',
  crm: 'Lead / CRM',
  booking: 'Booking / Customer',
  site_progress: 'Site Progress',
  material_request: 'Material Request',
  procurement: 'Procurement (PO / GRN / Stock)',
  supplier_voucher: 'Supplier Voucher',
  finance_collection: 'Finance — Collection',
  finance_expense: 'Finance — Expense Ledger',
  dashboard: 'Dashboard (Revenue / Cost)',
  master_data: 'Master Data / Settings',
  user_management: 'User Management',
};

const F: Permission = { level: 'full' };
const V: Permission = { level: 'view' };
const N: Permission = { level: 'none' };
const O: Permission = { level: 'own' };
const FS: Permission = { level: 'full', scoped: true };
const VS: Permission = { level: 'view', scoped: true };
const AS: Permission = { level: 'approve', scoped: true };
const CS: Permission = { level: 'create', scoped: true };

/**
 * Section 9.6, transcribed exactly.
 *
 * Section 9.2 is deliberate about this being a fixed table rather than a
 * role-builder: the matrix lives in code because the checks live in code, and
 * a UI that let someone invent a role would promise a flexibility the rest of
 * the application does not have. The Roles screen therefore *shows* this table
 * rather than editing it.
 */
export const PERMISSION_MATRIX: Record<ModuleKey, Record<UserRole, Permission>> = {
  land: {
    super_admin: F, management: V, land_team: F, project_manager: V,
    sales_executive: N, sales_manager: N, head_of_sales: N,
    site_manager: N, procurement: N, accounts: N,
  },
  project: {
    super_admin: F, management: V, land_team: V, project_manager: FS,
    sales_executive: V, sales_manager: V, head_of_sales: V,
    site_manager: VS, procurement: V, accounts: V,
  },
  crm: {
    super_admin: F, management: V, land_team: N, project_manager: N,
    sales_executive: O, sales_manager: F, head_of_sales: F,
    site_manager: N, procurement: N, accounts: N,
  },
  booking: {
    super_admin: F, management: V, land_team: N, project_manager: V,
    sales_executive: O, sales_manager: F, head_of_sales: F,
    site_manager: N, procurement: N, accounts: V,
  },
  site_progress: {
    super_admin: F, management: V, land_team: N, project_manager: FS,
    sales_executive: N, sales_manager: N, head_of_sales: N,
    site_manager: FS, procurement: N, accounts: N,
  },
  material_request: {
    super_admin: F, management: V, land_team: N, project_manager: AS,
    sales_executive: N, sales_manager: N, head_of_sales: N,
    site_manager: CS, procurement: { level: 'approve' }, accounts: N,
  },
  procurement: {
    super_admin: F, management: V, land_team: N, project_manager: VS,
    sales_executive: N, sales_manager: N, head_of_sales: N,
    site_manager: N, procurement: F, accounts: V,
  },
  supplier_voucher: {
    super_admin: F, management: V, land_team: N, project_manager: N,
    sales_executive: N, sales_manager: N, head_of_sales: N,
    site_manager: N, procurement: F, accounts: F,
  },
  finance_collection: {
    super_admin: F, management: V, land_team: N, project_manager: VS,
    sales_executive: N, sales_manager: N, head_of_sales: N,
    site_manager: N, procurement: N, accounts: F,
  },
  finance_expense: {
    super_admin: F, management: V, land_team: N, project_manager: N,
    sales_executive: N, sales_manager: N, head_of_sales: N,
    site_manager: N, procurement: N, accounts: F,
  },
  dashboard: {
    super_admin: F, management: F, land_team: N, project_manager: VS,
    sales_executive: N, sales_manager: { level: 'view' }, head_of_sales: { level: 'view' },
    site_manager: N, procurement: N, accounts: V,
  },
  master_data: {
    super_admin: F, management: N, land_team: N, project_manager: N,
    sales_executive: N, sales_manager: N, head_of_sales: N,
    site_manager: N, procurement: N, accounts: N,
  },
  user_management: {
    super_admin: F, management: N, land_team: N, project_manager: N,
    sales_executive: N, sales_manager: N, head_of_sales: N,
    site_manager: N, procurement: N, accounts: N,
  },
};

export function permissionFor(role: UserRole, module: ModuleKey): Permission {
  return PERMISSION_MATRIX[module][role];
}

/** Can this role open the module at all? */
export function canView(role: UserRole, module: ModuleKey): boolean {
  return permissionFor(role, module).level !== 'none';
}

/** Can this role change records in the module (not just read them)? */
export function canEdit(role: UserRole, module: ModuleKey): boolean {
  const { level } = permissionFor(role, module);
  return level === 'full' || level === 'own' || level === 'create';
}

/** Can this role act on the workflow — approve, decide, move a status along? */
export function canApprove(role: UserRole, module: ModuleKey): boolean {
  const { level } = permissionFor(role, module);
  return level === 'full' || level === 'approve';
}

/* ------------------------------------------------------------------ *
 * Project scoping (Section 9.5)
 * ------------------------------------------------------------------ */

/**
 * Roles that see every project without any mapping row.
 *
 * The distinction matters because the mapping is an **allow-list**, not a
 * filter: for every other role, no row means no project at all. Treating an
 * empty mapping as "everything" is the natural-looking mistake here, and it
 * would hand a new site manager the entire company on their first day.
 */
export const UNSCOPED_ROLES: UserRole[] = ['super_admin', 'management', 'land_team'];

export function hasAllProjectAccess(role: UserRole): boolean {
  return UNSCOPED_ROLES.includes(role);
}

/** Whether a role's reach in this module is limited to assigned projects. */
export function isScoped(role: UserRole, module: ModuleKey): boolean {
  return Boolean(permissionFor(role, module).scoped) && !hasAllProjectAccess(role);
}

/**
 * The projects a user may work on. `null` means "no restriction" — which is
 * not the same as an empty list, and callers must keep them apart.
 */
export function visibleProjectIds(
  role: UserRole,
  assignedProjectIds: string[],
): string[] | null {
  return hasAllProjectAccess(role) ? null : assignedProjectIds;
}

/* ------------------------------------------------------------------ *
 * Routes → modules
 * ------------------------------------------------------------------ */

/**
 * Which module a path belongs to, longest prefix first so
 * `/admin/material-requests` is not swallowed by a shorter match.
 *
 * This is what turns Section 9.6 from a table in a document into something the
 * application actually obeys: the sidebar hides what a role cannot open, and
 * the shell refuses the page if the URL is typed in directly.
 */
const ROUTE_MODULES: Array<[string, ModuleKey]> = [
  ['/admin/lands', 'land'],
  ['/admin/landowners', 'land'],
  ['/admin/projects', 'project'],
  ['/admin/leads', 'crm'],
  ['/admin/bookings', 'booking'],
  ['/admin/customers', 'booking'],
  ['/admin/site-progress', 'site_progress'],
  ['/admin/material-requests', 'material_request'],
  ['/admin/purchase-orders', 'procurement'],
  ['/admin/suppliers', 'procurement'],
  ['/admin/stock', 'procurement'],
  ['/admin/supplier-vouchers', 'supplier_voucher'],
  ['/admin/collections', 'finance_collection'],
  ['/admin/refunds', 'finance_collection'],
  ['/admin/expenses', 'finance_expense'],
  ['/admin/finance', 'dashboard'],
  ['/admin/users', 'user_management'],
  ['/admin/master-data', 'master_data'],
  ['/admin/settings', 'master_data'],
];

export function moduleForPath(pathname: string): ModuleKey | null {
  const match = ROUTE_MODULES.filter(([prefix]) => pathname.startsWith(prefix)).sort(
    (a, b) => b[0].length - a[0].length,
  )[0];
  return match?.[1] ?? null;
}
