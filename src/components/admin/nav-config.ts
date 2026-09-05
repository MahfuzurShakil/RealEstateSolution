import type { LucideIcon } from 'lucide-react';
import type { ModuleKey } from '@/lib/domain/access';
import { canApprove, canEdit } from '@/lib/domain/access';
import type { UserRole } from '@/lib/db/types';
import {
  Building2,
  Coins,
  HardHat,
  LayoutDashboard,
  Map,
  Package,
  UserRound,
  Users,
} from 'lucide-react';

export interface NavItem {
  label: string;
  href: string;
  /**
   * Which Section 9.6 module this item belongs to. The sidebar hides items the
   * acting role cannot open, so the menu is the first place the permission
   * matrix shows up rather than a table nobody reads.
   */
  module: ModuleKey | null;
  /** modules not built yet render disabled, so the shell shows the full map */
  disabled?: boolean;
  /**
   * An extra condition on top of the module check, for a screen that belongs to
   * two groups depending on who is looking. Only Material Requests uses it —
   * see the note on the Site Progress group.
   */
  visibleFor?: (role: UserRole) => boolean;
}

/**
 * Material Requests is the Site → Procurement bridge of Section 6.5, so it
 * genuinely belongs to two groups — and which one depends on what the role does
 * with it.
 *
 * It used to sit under Site Progress for everybody. That put Procurement's own
 * approval inbox under a heading for a module Procurement cannot otherwise
 * open (`site_progress` is `—` for that role in 9.6), while their Procurement
 * group did not mention it at all. So the person who lives in that queue had to
 * go looking for it in somebody else's section.
 *
 * One entry each, in the place that role uses it: approvers who do not raise
 * requests see it under Procurement, everyone else under Site Progress.
 */
const approvesButDoesNotRaise = (role: UserRole) =>
  canApprove(role, 'material_request') && !canEdit(role, 'material_request');
const raisesOrJustWatches = (role: UserRole) => !approvesButDoesNotRaise(role);

export interface NavGroup {
  label: string;
  icon: LucideIcon;
  items: NavItem[];
}

/** Sidebar groups mirror the eight modules of Scope Document v3.md. */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Dashboard',
    icon: LayoutDashboard,
    items: [{ label: 'Overview', href: '/admin', module: null }],
  },
  {
    label: 'Land Management',
    icon: Map,
    items: [
      { label: 'Lands', href: '/admin/lands', module: 'land' },
      { label: 'Landowners', href: '/admin/landowners', module: 'land' },
    ],
  },
  {
    label: 'Projects',
    icon: Building2,
    items: [
      { label: 'All Projects', href: '/admin/projects', module: 'project' },
    ],
  },
  {
    label: 'Sales & CRM',
    icon: UserRound,
    items: [
      { label: 'Leads', href: '/admin/leads', module: 'crm' },
      { label: 'Bookings', href: '/admin/bookings', module: 'booking' },
      { label: 'Customers', href: '/admin/customers', module: 'booking' },
    ],
  },
  {
    label: 'Site Progress',
    icon: HardHat,
    items: [
      { label: 'Progress Updates', href: '/admin/site-progress', module: 'site_progress' },
      {
        label: 'Material Requests',
        href: '/admin/material-requests',
        module: 'material_request',
        visibleFor: raisesOrJustWatches,
      },
    ],
  },
  {
    label: 'Procurement',
    icon: Package,
    items: [
      {
        label: 'Material Requests',
        href: '/admin/material-requests',
        module: 'material_request',
        visibleFor: approvesButDoesNotRaise,
      },
      { label: 'Purchase Orders', href: '/admin/purchase-orders', module: 'procurement' },
      { label: 'Suppliers', href: '/admin/suppliers', module: 'procurement' },
      { label: 'Stock', href: '/admin/stock', module: 'procurement' },
      { label: 'Material Items', href: '/admin/material-items', module: 'procurement' },
      { label: 'Supplier Vouchers', href: '/admin/supplier-vouchers', module: 'supplier_voucher' },
    ],
  },
  {
    label: 'Finance',
    icon: Coins,
    items: [
      { label: 'Overview', href: '/admin/finance', module: 'dashboard' },
      { label: 'Collections', href: '/admin/collections', module: 'finance_collection' },
      { label: 'Expenses', href: '/admin/expenses', module: 'finance_expense' },
      { label: 'Refunds', href: '/admin/refunds', module: 'finance_collection' },
    ],
  },
  {
    label: 'Administration',
    icon: Users,
    items: [
      { label: 'Users & Roles', href: '/admin/users', module: 'user_management' },
      { label: 'Master Data', href: '/admin/master-data', module: 'master_data' },
      { label: 'Company Settings', href: '/admin/settings', module: 'master_data' },
    ],
  },
];

/*
 * There used to be a `HELP_ITEM` pinned to the bottom of the sidebar. It
 * rendered as plain text rather than a link, and the `/admin/help` route it
 * named does not exist — typing the URL returned a 404. Removed rather than
 * left looking clickable; it comes back when there is something to open.
 */
