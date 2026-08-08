import type {
  Customer,
  Vendor,
  Invoice,
  Expense,
  MonthlyFigure,
  Quotation,
} from '../types';

export const customers: Customer[] = [
  { id: 'c1', name: 'Meridian Interiors', contact: '+91 98200 11223', gstin: '27ABCPM1234F1Z5', totalBilled: 486000, outstanding: 62000 },
  { id: 'c2', name: 'Kapoor Residence', contact: '+91 90040 55621', totalBilled: 128500, outstanding: 0 },
  { id: 'c3', name: 'Grand Vista Hotels', contact: '+91 98330 77410', gstin: '27GVHPL5678K1Z2', totalBilled: 941200, outstanding: 184000 },
  { id: 'c4', name: 'Sharma Furnishings', contact: '+91 99870 12456', totalBilled: 76300, outstanding: 18500 },
  { id: 'c5', name: 'Lakeview Builders', contact: '+91 91680 33290', gstin: '27LVBPL9081N1Z8', totalBilled: 612400, outstanding: 0 },
  { id: 'c6', name: 'Om Sai Enterprises', contact: '+91 87650 44120', totalBilled: 39800, outstanding: 39800 },
];

export const vendors: Vendor[] = [
  { id: 'v1', name: 'Saint-Roch Glass Suppliers', category: 'Raw Material — Sheet Glass', contact: '+91 98220 60011', totalPurchased: 512000, payable: 84000 },
  { id: 'v2', name: 'Precision Hardware Co.', category: 'Fittings & Hardware', contact: '+91 90210 44780', totalPurchased: 187500, payable: 0 },
  { id: 'v3', name: 'ClearBond Sealants', category: 'Silicone & Adhesives', contact: '+91 97650 22190', totalPurchased: 64200, payable: 12400 },
  { id: 'v4', name: 'Swift Freight Movers', category: 'Transport', contact: '+91 88990 11004', totalPurchased: 45800, payable: 6200 },
];

export const invoices: Invoice[] = [
  { id: 'INV-1042', customerId: 'c1', kind: 'job', description: '12mm toughened glass partition — Andheri office', amount: 62000, gst: 11160, date: '2026-07-18', dueDate: '2026-08-01', status: 'due' },
  { id: 'INV-1041', customerId: 'c3', kind: 'job', description: 'Lobby mirror wall — Grand Vista, Powai', amount: 184000, gst: 33120, date: '2026-07-12', dueDate: '2026-07-27', status: 'overdue' },
  { id: 'INV-1040', customerId: 'c2', kind: 'quick', description: 'Table-top glass, 6mm, cut to size', amount: 4200, gst: 0, date: '2026-07-10', dueDate: '2026-07-17', status: 'paid' },
  { id: 'INV-1039', customerId: 'c5', kind: 'job', description: 'Shower cubicle glazing — 14 units, Lakeview Phase 2', amount: 312400, gst: 56232, date: '2026-07-05', dueDate: '2026-07-20', status: 'paid' },
  { id: 'INV-1038', customerId: 'c4', kind: 'quick', description: 'Photo frame glass — bulk order', amount: 18500, gst: 0, date: '2026-06-29', dueDate: '2026-07-13', status: 'due' },
  { id: 'INV-1037', customerId: 'c6', kind: 'quick', description: 'Mirror sheet, 4x3 ft', amount: 39800, gst: 0, date: '2026-06-20', dueDate: '2026-07-04', status: 'overdue' },
];

export const expenses: Expense[] = [
  { id: 'e1', category: 'Raw Material', vendorId: 'v1', description: 'Sheet glass restock — 200 units', amount: 214000, date: '2026-07-14' },
  { id: 'e2', category: 'Labor', description: 'Fabrication team wages — July, week 3', amount: 86000, date: '2026-07-19' },
  { id: 'e3', category: 'Transport', vendorId: 'v4', description: 'Delivery — Grand Vista lobby job', amount: 9400, date: '2026-07-12' },
  { id: 'e4', category: 'Rent', description: 'Workshop rent — July', amount: 45000, date: '2026-07-01' },
  { id: 'e5', category: 'Utilities', description: 'Electricity — July', amount: 18200, date: '2026-07-05' },
  { id: 'e6', category: 'Maintenance', description: 'Glass cutting machine servicing', amount: 12600, date: '2026-06-27' },
];

export const monthlyFigures: MonthlyFigure[] = [
  { month: 'Feb', revenue: 412000, expenses: 298000 },
  { month: 'Mar', revenue: 486000, expenses: 331000 },
  { month: 'Apr', revenue: 398000, expenses: 276000 },
  { month: 'May', revenue: 552000, expenses: 342000 },
  { month: 'Jun', revenue: 601000, expenses: 389000 },
  { month: 'Jul', revenue: 634000, expenses: 401000 },
];

export const quotations: Quotation[] = [
  {
    id: 'QUO-201',
    customerId: 'c3',
    description: 'Rooftop pergola glazing — Grand Vista Hotels, 9 panels',
    amount: 248000,
    gst: 0,
    date: '2026-07-22',
    validUntil: '2026-08-05',
    status: 'pending',
  },
  {
    id: 'QUO-200',
    customerId: 'c4',
    description: 'Wardrobe mirror shutters — Sharma Furnishings, set of 6',
    amount: 32500,
    gst: 0,
    date: '2026-07-15',
    validUntil: '2026-07-29',
    status: 'pending',
  },
];