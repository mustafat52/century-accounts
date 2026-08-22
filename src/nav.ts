export interface NavItem {
  to: string;
  label: string;
  end?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/invoicing', label: 'Invoicing' },
  { to: '/price-list', label: 'Price List' },
  { to: '/customers', label: 'Customers' },
  { to: '/vendors', label: 'Vendors' },
  { to: '/purchase-bills', label: 'Purchase Bills' },
  { to: '/expenses', label: 'Expenses' },
  { to: '/reports', label: 'Reports' },
  { to: '/links', label: 'Links' },
];