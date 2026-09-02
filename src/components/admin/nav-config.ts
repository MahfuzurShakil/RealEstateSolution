import type { LucideIcon } from 'lucide-react';
import type { ModuleKey } from '@/lib/domain/access';
import {
  Building2,
  Coins,
  HardHat,
  LayoutDashboard,
  Map,
  Package,
  Settings,
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
}

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
      { label: 'Material Requests', href: '/admin/material-requests', module: 'material_request' },
    ],
  },
  {
    label: 'Procurement',
    icon: Package,
    items: [
      { label: 'Purchase Orders', href: '/admin/purchase-orders', module: 'procurement' },
      { label: 'Suppliers', href: '/admin/suppliers', module: 'procurement' },
      { label: 'Stock', href: '/admin/stock', module: 'procurement' },
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

export const HELP_ITEM = { label: 'Help and Support', href: '/admin/help', icon: Settings };
