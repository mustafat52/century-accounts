// Sibling of nav.ts, deliberately not merged into NAV_ITEMS — the
// inventory module gets its own separate nav list per spec section 5,
// mirroring this file's shape (to, label, end) for consistency.

export interface InventoryNavItem {
  to: string;
  label: string;
  end?: boolean;
}

export const INVENTORY_NAV_ITEMS: InventoryNavItem[] = [
  { to: '/inventory/stock', label: 'Categories & Stock' },
  { to: '/inventory/waste', label: 'Waste' },
  { to: '/inventory/cutting', label: 'Cutting Plan' },
];