import type { LucideIcon } from 'lucide-react';
import type { ModuleKey } from '@/lib/domain/access';
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
   * groups depending on who is looking. Nothing uses it since the Site
   * Progress group went (2026-10-11); kept for the next item that needs it.
   */
  visibleFor?: (role: UserRole) => boolean;
}

/**
 * Material Requests is the Site → Procurement bridge of Section 6.5. Since
 * 2026-10-11 it has one entry, under Procurement, for everyone with access:
 * the site raises and follows its own requests from the project's Materials
 * tab, and this list is every project's requests in one place.
 */

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
    // project starts the life cycle; land sits under it (client, 2026-10-10)
    label: 'Projects',
    icon: Building2,
    items: [
      { label: 'All Projects', href: '/admin/projects', module: 'project' },
    ],
  },
  {
    label: 'Land Management',
    icon: Map,
    items: [
      { label: 'Lands', href: '/admin/lands', module: 'land' },
      { label: 'Landowners', href: '/admin/landowners', module: 'land' },
    ],
  },
  /*
   * Its own menu after Lands (client, 2026-10-17), in the order the work
   * happens: project → land → construction. Each site's workspace — progress,
   * materials, requests — opens from here.
   */
  {
    label: 'Construction',
    icon: HardHat,
    items: [{ label: 'Construction Sites', href: '/admin/site-progress', module: 'site_progress' }],
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
  /*
   * No Site Progress group (client feedback 2026-10-11): site log updates and
   * material requests are made from the project's own tabs. Procurement keeps
   * the all-project request list below.
   */
  {
    label: 'Procurement',
    icon: Package,
    items: [
      {
        label: 'Material Requests',
        href: '/admin/material-requests',
        module: 'material_request',
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
      { label: 'Cash Position', href: '/admin/cash', module: 'finance_expense' },
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
