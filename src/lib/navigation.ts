import {
  LayoutDashboard,
  FileText,
  ListChecks,
  AlertTriangle,
  CreditCard,
  FolderOpen,
  Settings2,
  Users,
  Shield,
  Building2,
  SlidersHorizontal,
  type LucideIcon,
} from 'lucide-react';
import { CAPABILITIES as C, type Capability } from './constants';

/**
 * The sidebar, as data.
 *
 * Every entry declares the capability it needs. `visibleNav()` filters the
 * tree, so a role never sees a link it cannot follow — which is the whole
 * point: a nav item that 403s is a bug the user experiences as the product
 * being broken.
 *
 * This filtering is CHROME ONLY. It decides what is shown, never what is
 * permitted. The server re-derives permission on every request regardless.
 */

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Any one of these grants visibility. */
  capabilities?: Capability[];
  /** Rendered but not yet built — the phase that delivers it. */
  comingIn?: string;
};

export type NavSection = {
  label?: string;
  items: NavItem[];
};

export const NAV: NavSection[] = [
  {
    items: [{ label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard }],
  },
  {
    label: 'Work',
    items: [
      {
        label: 'Applications',
        href: '/applications',
        icon: FileText,
        capabilities: [C.APPLICATION_VIEW],
      },
      {
        // WORKFLOW_VIEW, not WORKFLOW_CLAIM_TASK: a supervisor or an auditor
        // may look at what is sitting at a desk without being able to take any
        // of it. Claiming is gated on the button and again at the endpoint.
        label: 'Tasks',
        href: '/tasks',
        icon: ListChecks,
        capabilities: [C.WORKFLOW_VIEW],
      },
      {
        label: 'Shortfalls',
        href: '/shortfalls',
        icon: AlertTriangle,
        capabilities: [C.SHORTFALL_VIEW],
      },
      {
        label: 'Payments',
        href: '/payments',
        icon: CreditCard,
        capabilities: [C.PAYMENT_VIEW],
      },
      {
        label: 'Documents',
        href: '/documents',
        icon: FolderOpen,
        capabilities: [C.DOCUMENT_VIEW],
      },
    ],
  },
  {
    label: 'Administration',
    items: [
      { label: 'Users', href: '/admin/users', icon: Users, capabilities: [C.USER_MANAGE] },
      { label: 'Roles', href: '/admin/roles', icon: Shield, capabilities: [C.ROLE_MANAGE] },
      {
        label: 'Organisation',
        href: '/admin/organisation',
        icon: Building2,
        capabilities: [C.ORG_MANAGE],
      },
      {
        label: 'Document types',
        href: '/admin/document-types',
        icon: FolderOpen,
        capabilities: [C.MASTER_DATA_MANAGE],
      },
    ],
  },
  {
    label: 'System',
    items: [
      {
        label: 'Settings',
        href: '/admin/settings',
        icon: SlidersHorizontal,
        capabilities: [C.SETTINGS_MANAGE],
      },
      { label: 'Profile', href: '/profile', icon: Settings2 },
    ],
  },
];

/** Filters the tree to what this user may actually reach. */
export function visibleNav(capabilities: string[]): NavSection[] {
  const can = (item: NavItem) =>
    !item.capabilities?.length || item.capabilities.some((c) => capabilities.includes(c));

  return NAV.map((section) => ({ ...section, items: section.items.filter(can) })).filter(
    (section) => section.items.length > 0
  );
}

/** Breadcrumb labels for path segments that are not self-explanatory. */
const SEGMENT_LABELS: Record<string, string> = {
  admin: 'Administration',
  users: 'Users',
  roles: 'Roles',
  organisation: 'Organisation',
  settings: 'Settings',
  audit: 'Audit log',
  dashboard: 'Dashboard',
  applications: 'Applications',
  tasks: 'Tasks',
  shortfalls: 'Shortfalls',
  payments: 'Payments',
  documents: 'Documents',
  reports: 'Reports',
  analytics: 'Analytics',
  profile: 'Profile',
  new: 'New',
};

export function breadcrumbsFor(pathname: string): Array<{ label: string; href: string }> {
  const segments = pathname.split('/').filter(Boolean);

  return segments.map((segment, i) => {
    const href = '/' + segments.slice(0, i + 1).join('/');
    const label =
      SEGMENT_LABELS[segment] ??
      // A UUID segment is a record id, not a page name.
      (/^[0-9a-f-]{20,}$/i.test(segment)
        ? 'Details'
        : segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, ' '));
    return { label, href };
  });
}
