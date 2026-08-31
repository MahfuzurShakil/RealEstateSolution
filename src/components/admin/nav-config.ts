import type { LucideIcon } from 'lucide-react';
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
    items: [{ label: 'Overview', href: '/admin' }],
  },
  {
    label: 'Land Management',
    icon: Map,
    items: [
      { label: 'Lands', href: '/admin/lands' },
      { label: 'Landowners', href: '/admin/landowners' },
    ],
  },
  {
    label: 'Projects',
    icon: Building2,
    items: [
      { label: 'All Projects', href: '/admin/projects', disabled: true },
      { label: 'Towers & Units', href: '/admin/units', disabled: true },
    ],
  },
  {
    label: 'Sales & CRM',
    icon: UserRound,
    items: [
      { label: 'Leads', href: '/admin/leads', disabled: true },
      { label: 'Bookings', href: '/admin/bookings', disabled: true },
      { label: 'Customers', href: '/admin/customers', disabled: true },
    ],
  },
  {
    label: 'Site Progress',
    icon: HardHat,
    items: [
      { label: 'Progress Updates', href: '/admin/site-progress', disabled: true },
      { label: 'Material Requests', href: '/admin/material-requests', disabled: true },
    ],
  },
  {
    label: 'Procurement',
    icon: Package,
    items: [
      { label: 'Purchase Orders', href: '/admin/purchase-orders', disabled: true },
      { label: 'Suppliers', href: '/admin/suppliers', disabled: true },
      { label: 'Stock', href: '/admin/stock', disabled: true },
    ],
  },
  {
    label: 'Finance',
    icon: Coins,
    items: [
      { label: 'Collections', href: '/admin/collections', disabled: true },
      { label: 'Expenses', href: '/admin/expenses', disabled: true },
    ],
  },
  {
    label: 'Administration',
    icon: Users,
    items: [
      { label: 'Users & Roles', href: '/admin/users', disabled: true },
      { label: 'Master Data', href: '/admin/master-data', disabled: true },
      { label: 'Company Settings', href: '/admin/settings', disabled: true },
    ],
  },
];

export const HELP_ITEM = { label: 'Help and Support', href: '/admin/help', icon: Settings };
