import React, { createContext, useContext, useState, useMemo, useEffect, useCallback } from 'react';
import type { Session } from '@supabase/supabase-js';
import type {
  Customer,
  Vendor,
  Expense,
  ExpenseCategory,
  Invoice,
  InvoiceItem,
  InvoiceSlab,
  Quotation,
  QuotationPayment,
  PaymentMethod,
  MonthlyFigure,
  Worker,
  WorkerAdvance,
  WorkerPayment,
  ImportantLink,
  DashboardSummary,
  VendorPurchase,
  VendorPayment,
  PriceListItem,
  VendorSlip,
  VendorSlipItem,
  CareOf,
  PurchaseBill,
  PurchaseBillItem,
  PurchaseBillTaxType,
  QuotationItem,
  EmployeeProfile,
  UserRole,
} from '../types';
import { SLAB_DISCOUNT_PERCENT } from '../types';
import { supabase } from '../lib/supabaseClient';
import { guardMobile } from '../lib/mobileGuard';
import { glassLine, simpleLine, quotationTotals } from '../lib/quotationMath';
import { useIsMobile } from '../hooks/useIsMobile';
import {
  mapCustomerBalance,
  mapVendorBalance,
  mapInvoice,
  mapInvoiceItem,
  mapQuotation,
  mapQuotationPayment,
  mapExpense,
  mapMonthlyFigure,
  mapWorker,
  mapWorkerAdvance,
  mapWorkerPayment,
  mapImportantLink,
  mapDashboardSummary,
  mapVendorPurchase,
  mapVendorPayment,
  mapPriceListItem,
  mapVendorSlip,
  mapVendorSlipItem,
  mapPurchaseBill,
  mapPurchaseBillItem,
  mapQuotationItem,
  mapEmployeeProfile,
} from '../lib/mappers';

export type NewQuotationItemInput =
  | {
      type: 'simple';
      description: string;
      area: string | null;
      quantity: number;
      rate: number;
    }
  | {
      type: 'glass';
      description: string;
      area: string | null;
      thicknessMm: string | null;
      lengthIn: number;
      widthIn: number;
      qty: number;
      ratePerSft: number;
      polishRate: number;
      fixingRatePerSft: number;
    };

interface NewCustomerInput {
  name: string;
  contact?: string;
  address?: string;
  gstin?: string;
}

interface NewVendorInput {
  name: string;
  category: string;
  contact: string;
}

interface NewExpenseInput {
  category: ExpenseCategory;
  description: string;
  amount: number;
  date: string;
}

interface NewVendorPurchaseInput {
  vendorId: string;
  category: ExpenseCategory;
  description: string;
  amount: number;
  date: string;
}

interface NewVendorSlipItemInput {
  description: string;
  quantity: number;
  unit: string;
}

interface NewVendorSlipInput {
  vendorId: string;
  careOf: CareOf;
  customerName?: string | null;
  items: NewVendorSlipItemInput[];
}

interface NewPurchaseBillItemInput {
  hsnCode: string;
  description: string;
  quantity: number;
  rate: number;
  gstRate: number; // 5 / 12 / 18 / 28
}

interface NewPurchaseBillInput {
  supplierGstin: string;
  supplierName: string;
  supplierAddress: string;
  invoiceNo: string;
  invoiceDate: string;
  placeOfSupply: string;
  taxType: PurchaseBillTaxType;
  items: NewPurchaseBillItemInput[];
}

interface NewQuotationInput {
  customerId: string;
  validUntil: string;
  slab: InvoiceSlab;
  discountPercent: number; // only meaningful when slab === 'A'; otherwise derived from SLAB_DISCOUNT_PERCENT
  transportation: number;
  gstEnabled?: boolean; // defaults to the global GST switch when omitted
  items: NewQuotationItemInput[];
}

interface EditQuotationInput {
  validUntil: string;
  slab: InvoiceSlab;
  discountPercent: number;
  transportation: number;
  gstEnabled: boolean; // the quotation's own GST state, confirmed in the edit modal
  items: NewQuotationItemInput[];
}

interface NewWorkerInput {
  name: string;
  monthlySalary: number;
}

interface NewWorkerAdvanceInput {
  workerId: string;
  amount: number;
  date: string;
  note?: string;
}

interface NewLinkInput {
  label: string;
  url: string;
  category?: string;
}

interface NewPriceListItemInput {
  description: string;
  ratePerSft: number;
  polishRate: number;
  fixingRate: number;
}

export interface PaymentReceipt {
  paymentAmount: number;
  paymentDate: string;
  method: PaymentMethod;
  note?: string;
  quotation: Quotation;
}

export type ToastKind = 'error' | 'success' | 'info';
export interface Toast {
  id: number;
  message: string;
  kind: ToastKind;
}

export type PrintTarget = { kind: 'invoice' | 'quotation' | 'ledger' | 'slip'; id: string } | null;

interface AppContextValue {
  gstEnabled: boolean;
  toggleGst: () => void;

  toast: Toast | null;
  showToast: (message: string, kind?: ToastKind) => void;
  dismissToast: () => void;

  customers: Customer[];
  addCustomer: (input: NewCustomerInput) => Promise<Customer | null>;
  updateCustomer: (id: string, input: NewCustomerInput) => Promise<boolean>;

  vendors: Vendor[];
  addVendor: (input: NewVendorInput) => Promise<Vendor | null>;
  updateVendor: (id: string, input: NewVendorInput) => Promise<boolean>;

  expenses: Expense[];
  addExpense: (input: NewExpenseInput) => Promise<boolean>;

  vendorPurchases: VendorPurchase[];
  vendorPayments: VendorPayment[];
  addVendorPurchase: (input: NewVendorPurchaseInput) => Promise<boolean>;
  recordVendorPayment: (vendorId: string, amount: number, note?: string) => Promise<boolean>;

  vendorSlips: VendorSlip[];
  addVendorSlip: (input: NewVendorSlipInput) => Promise<VendorSlip | null>;
  priceVendorSlip: (slipId: string, itemRates: { itemId: string; rate: number }[]) => Promise<boolean>;

  purchaseBills: PurchaseBill[];
  addPurchaseBill: (input: NewPurchaseBillInput) => Promise<PurchaseBill | null>;

  monthlyFigures: MonthlyFigure[];
  dashboardSummary: DashboardSummary;

  invoices: Invoice[];
  // Roll back a settled invoice: deletes it outright and reopens its
  // source quotation as 'pending' again, exactly where it left off.
  rollbackInvoiceToQuotation: (invoiceDbId: string) => Promise<string | null>;

  quotations: Quotation[];
  addQuotation: (input: NewQuotationInput) => Promise<Quotation | null>;
  updateQuotation: (quotationDbId: string, input: EditQuotationInput) => Promise<boolean>;
  fetchQuotationItems: (quotationDbId: string) => Promise<NewQuotationItemInput[]>;
  fetchQuotationItemsForPrint: (quotationDbId: string) => Promise<QuotationItem[]>;
  // Only succeeds once the quotation's balanceAmount has reached zero —
  // enforced again server-side by the RPC regardless of what the UI shows.
  convertQuotationToInvoice: (quotationDbId: string) => Promise<Invoice | null>;
  deleteQuotation: (quotationDbId: string) => Promise<boolean>;

  quotationPayments: QuotationPayment[];
  recordQuotationPayment: (
    quotationDbId: string,
    amount: number,
    method: PaymentMethod,
    note?: string
  ) => Promise<PaymentReceipt | null>;

  workers: Worker[];
  addWorker: (input: NewWorkerInput) => Promise<boolean>;
  updateWorker: (workerId: string, input: NewWorkerInput) => Promise<boolean>;
  workerAdvances: WorkerAdvance[];
  logWorkerAdvance: (input: NewWorkerAdvanceInput) => Promise<boolean>;
  workerPayments: WorkerPayment[];
  recordWorkerPayment: (workerId: string, amount: number, date: string, forMonth: string, note?: string) => Promise<boolean>;

  links: ImportantLink[];
  addLink: (input: NewLinkInput) => Promise<boolean>;

  priceList: PriceListItem[];
  addPriceListItem: (input: NewPriceListItemInput) => Promise<boolean>;
  updatePriceListItem: (id: string, input: NewPriceListItemInput) => Promise<boolean>;
  deletePriceListItem: (id: string) => Promise<boolean>;

  isCustomerModalOpen: boolean;
  editingCustomerId: string | null;
  openCustomerModal: () => void;
  openEditCustomerModal: (customerId: string) => void;
  closeCustomerModal: () => void;

  isVendorModalOpen: boolean;
  editingVendorId: string | null;
  openVendorModal: () => void;
  openEditVendorModal: (vendorId: string) => void;
  closeVendorModal: () => void;

  isExpenseModalOpen: boolean;
  openExpenseModal: () => void;
  closeExpenseModal: () => void;

  isQuotationModalOpen: boolean;
  quotationModalCustomerId: string | null;
  editingQuotationId: string | null;
  openQuotationModal: (customerId?: string) => void;
  openEditQuotationModal: (quotationDbId: string) => void;
  closeQuotationModal: () => void;

  isWorkerModalOpen: boolean;
  editingWorkerId: string | null;
  openWorkerModal: () => void;
  openEditWorkerModal: (workerId: string) => void;
  closeWorkerModal: () => void;

  isLinkModalOpen: boolean;
  openLinkModal: () => void;
  closeLinkModal: () => void;

  isPaymentModalOpen: boolean;
  paymentModalQuotationDbId: string | null;
  openPaymentModal: (quotationDbId: string) => void;
  closePaymentModal: () => void;

  printTarget: PrintTarget;
  openPrint: (kind: 'invoice' | 'quotation' | 'ledger' | 'slip', id: string) => void;
  closePrint: () => void;

  paymentReceipt: PaymentReceipt | null;
  closePaymentReceipt: () => void;

  authLoading: boolean;
  dataLoading: boolean;
  hasLoadedOnce: boolean;
  isAuthenticated: boolean;
  currentUserName: string | null;
  currentUserId: string | null;
  // 'owner' only for Abdul Hussain's login — gates the Employee Control
  // tab and the mutating actions on it (see migrations/002_employee_control.sql).
  // null while auth is still resolving.
  currentUserRole: UserRole | null;
  login: (email: string, password: string) => Promise<{ name: string } | { error: string }>;
  logout: () => Promise<void>;
  // Set once, right after sign-in fails because the account's isActive
  // flag is off, or after being force-signed-out mid-session for the
  // same reason (see the periodic check in AppProvider) — Login.tsx
  // surfaces this as the error message, then clears it.
  accessDeniedMessage: string | null;
  clearAccessDeniedMessage: () => void;

  // ---- Employee control (owner only — see role above) ----
  // Loaded only when currentUserRole === 'owner'; empty for an employee,
  // since there's nothing for them to manage. RLS also allows any
  // signed-in user to read every profiles row, so this isn't a security
  // boundary by itself — the DB-side owner check on writes is (see the
  // migration) — this is just about not loading unused data for staff.
  employees: EmployeeProfile[];
  refreshEmployees: () => Promise<void>;
  // Returns an error message on failure, or null on success.
  setEmployeeActive: (id: string, isActive: boolean) => Promise<string | null>;
  createEmployee: (input: { displayName: string; email: string; password: string }) => Promise<string | null>;
  deleteEmployee: (id: string) => Promise<string | null>;

  // True below the mobile breakpoint (see useIsMobile.ts). Every mutating
  // function on this context already no-ops itself when this is true
  // (see guardMobile below) — components mainly need this for deciding
  // what to RENDER (e.g. an inline-editable field vs. plain text), not
  // for deciding whether it's safe to call an action.
  isMobileView: boolean;
}

const AppContext = createContext<AppContextValue | null>(null);

const EMPTY_SUMMARY: DashboardSummary = { customersPaidThisMonth: 0, quotationsActive: 0, quotationsOverdue: 0, jobsCompletedThisMonth: 0 };

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [gstEnabled, setGstEnabled] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const showToast = useCallback((message: string, kind: ToastKind = 'info') => {
    setToast({ id: Date.now(), message, kind });
  }, []);
  const dismissToast = useCallback(() => setToast(null), []);
  // Every failed write reports through here: the real error goes to the
  // console for debugging and a readable message to the user.
  const reportError = (action: string, error?: { message?: string } | null) => {
    console.error(`[${action}]`, error);
    showToast(`${action} failed${error?.message ? `: ${error.message}` : '.'}`, 'error');
  };
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [vendorPurchases, setVendorPurchases] = useState<VendorPurchase[]>([]);
  const [vendorPayments, setVendorPayments] = useState<VendorPayment[]>([]);
  const [vendorSlips, setVendorSlips] = useState<VendorSlip[]>([]);
  const [purchaseBills, setPurchaseBills] = useState<PurchaseBill[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [quotationPayments, setQuotationPayments] = useState<QuotationPayment[]>([]);
  const [monthlyFigures, setMonthlyFigures] = useState<MonthlyFigure[]>([]);
  const [dashboardSummary, setDashboardSummary] = useState<DashboardSummary>(EMPTY_SUMMARY);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [links, setLinks] = useState<ImportantLink[]>([]);
  const [priceList, setPriceList] = useState<PriceListItem[]>([]);

  const [isCustomerModalOpen, setCustomerModalOpen] = useState(false);
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);
  const [isVendorModalOpen, setVendorModalOpen] = useState(false);
  const [editingVendorId, setEditingVendorId] = useState<string | null>(null);
  const [isExpenseModalOpen, setExpenseModalOpen] = useState(false);
  const [isQuotationModalOpen, setQuotationModalOpen] = useState(false);
  const [quotationModalCustomerId, setQuotationModalCustomerId] = useState<string | null>(null);
  const [editingQuotationId, setEditingQuotationId] = useState<string | null>(null);
  const [isWorkerModalOpen, setWorkerModalOpen] = useState(false);
  const [editingWorkerId, setEditingWorkerId] = useState<string | null>(null);
  const [workerAdvances, setWorkerAdvances] = useState<WorkerAdvance[]>([]);
  const [workerPayments, setWorkerPayments] = useState<WorkerPayment[]>([]);
  const [isLinkModalOpen, setLinkModalOpen] = useState(false);
  const [isPaymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentModalQuotationDbId, setPaymentModalQuotationDbId] = useState<string | null>(null);
  const [printTarget, setPrintTarget] = useState<PrintTarget>(null);
  const [paymentReceipt, setPaymentReceipt] = useState<PaymentReceipt | null>(null);

  const [session, setSession] = useState<Session | null>(null);
  const [currentUserName, setCurrentUserName] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<UserRole | null>(null);
  const [accessDeniedMessage, setAccessDeniedMessage] = useState<string | null>(null);
  const [employees, setEmployees] = useState<EmployeeProfile[]>([]);
  const [authLoading, setAuthLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  const isAuthenticated = Boolean(session);
  const isMobileView = useIsMobile();

  // ---------- Data loading ----------
  const refreshCustomers = useCallback(async () => {
    const { data } = await supabase.from('customer_balances').select('*').order('name');
    if (data) setCustomers(data.map(mapCustomerBalance));
  }, []);

  const refreshVendors = useCallback(async () => {
    const { data } = await supabase.from('vendor_balances').select('*').order('name');
    if (data) setVendors(data.map(mapVendorBalance));
  }, []);

  const refreshVendorPurchases = useCallback(async () => {
    const { data } = await supabase.from('vendor_purchases_effective').select('*').order('expense_date', { ascending: false });
    if (data) setVendorPurchases(data.map(mapVendorPurchase));
  }, []);

  const refreshVendorPayments = useCallback(async () => {
    const { data } = await supabase.from('vendor_payments').select('*').order('payment_date', { ascending: false });
    if (data) setVendorPayments(data.map(mapVendorPayment));
  }, []);

  const refreshVendorSlips = useCallback(async () => {
    const [slipsRes, itemsRes] = await Promise.all([
      supabase.from('vendor_slips').select('*').order('created_at', { ascending: false }),
      supabase.from('vendor_slip_items').select('*').order('sort_order'),
    ]);
    if (slipsRes.data) {
      const itemsBySlip = new Map<string, VendorSlipItem[]>();
      (itemsRes.data ?? []).forEach((row: any) => {
        const list = itemsBySlip.get(row.slip_id) ?? [];
        list.push(mapVendorSlipItem(row));
        itemsBySlip.set(row.slip_id, list);
      });
      setVendorSlips(slipsRes.data.map((row: any) => mapVendorSlip(row, itemsBySlip.get(row.id) ?? [])));
    }
  }, []);

  const refreshWorkers = useCallback(async () => {
    const { data } = await supabase.from('worker_month_summary').select('*').order('name');
    if (data) setWorkers(data.map(mapWorker));
  }, []);

  const refreshWorkerAdvances = useCallback(async () => {
    const { data } = await supabase.from('worker_advances').select('*').order('advance_date', { ascending: false });
    if (data) setWorkerAdvances(data.map(mapWorkerAdvance));
  }, []);

  const refreshWorkerPayments = useCallback(async () => {
    const { data } = await supabase.from('worker_payments').select('*').order('payment_date', { ascending: false });
    if (data) setWorkerPayments(data.map(mapWorkerPayment));
  }, []);

  const refreshExpenses = useCallback(async () => {
    const { data } = await supabase
      .from('expenses')
      .select('*')
      .is('vendor_id', null)
      .order('created_at', { ascending: false });
    if (data) setExpenses(data.map(mapExpense));
  }, []);

  const refreshDashboardSummary = useCallback(async () => {
    const { data } = await supabase.from('dashboard_summary').select('*').single();
    if (data) setDashboardSummary(mapDashboardSummary(data));
  }, []);

  const refreshPriceList = useCallback(async () => {
    const { data } = await supabase.from('price_list').select('*').order('sort_order');
    if (data) setPriceList(data.map(mapPriceListItem));
  }, []);

  const refreshQuotations = useCallback(async () => {
    const { data } = await supabase.from('quotations_effective').select('*').order('created_at', { ascending: false });
    if (data) setQuotations(data.map(mapQuotation));
  }, []);

  const refreshQuotationPayments = useCallback(async () => {
    const { data } = await supabase.from('quotation_payments').select('*').order('payment_date', { ascending: false });
    if (data) setQuotationPayments(data.map(mapQuotationPayment));
  }, []);

  // Fetches one invoice + its items — used right after
  // convertQuotationToInvoice, since the RPC returns just the invoice row
  // itself and the full object (with items) is what state needs.
  const fetchInvoiceById = useCallback(async (dbId: string): Promise<Invoice | null> => {
    const [invRes, itemsRes] = await Promise.all([
      supabase.from('invoices').select('*').eq('id', dbId).single(),
      supabase.from('invoice_items').select('*').eq('invoice_id', dbId).order('sort_order'),
    ]);
    if (invRes.error || !invRes.data) return null;
    const items = (itemsRes.data ?? []).map(mapInvoiceItem);
    return mapInvoice(invRes.data, items);
  }, []);

  const loadAllData = useCallback(async () => {
    setDataLoading(true);
    const [
      settingsRes,
      customersRes,
      vendorsRes,
      invoicesRes,
      itemsRes,
      quotationsRes,
      quotationPaymentsRes,
      expensesRes,
      vendorPurchasesRes,
      vendorPaymentsRes,
      monthlyRes,
      workersRes,
      workerAdvancesRes,
      workerPaymentsRes,
      linksRes,
      summaryRes,
      priceListRes,
      vendorSlipsRes,
      vendorSlipItemsRes,
      purchaseBillsRes,
      purchaseBillItemsRes,
    ] = await Promise.all([
      supabase.from('business_settings').select('*').single(),
      supabase.from('customer_balances').select('*').order('name'),
      supabase.from('vendor_balances').select('*').order('name'),
      supabase.from('invoices').select('*').order('created_at', { ascending: false }),
      supabase.from('invoice_items').select('*').order('sort_order'),
      supabase.from('quotations_effective').select('*').order('created_at', { ascending: false }),
      supabase.from('quotation_payments').select('*').order('payment_date', { ascending: false }),
      supabase.from('expenses').select('*').is('vendor_id', null).order('created_at', { ascending: false }),
      supabase.from('vendor_purchases_effective').select('*').order('expense_date', { ascending: false }),
      supabase.from('vendor_payments').select('*').order('payment_date', { ascending: false }),
      supabase.from('monthly_revenue_expense').select('*'),
      supabase.from('worker_month_summary').select('*').order('name'),
      supabase.from('worker_advances').select('*').order('advance_date', { ascending: false }),
      supabase.from('worker_payments').select('*').order('payment_date', { ascending: false }),
      supabase.from('important_links').select('*').order('sort_order'),
      supabase.from('dashboard_summary').select('*').single(),
      supabase.from('price_list').select('*').order('sort_order'),
      supabase.from('vendor_slips').select('*').order('created_at', { ascending: false }),
      supabase.from('vendor_slip_items').select('*').order('sort_order'),
      supabase.from('purchase_bills').select('*').order('invoice_date', { ascending: false }),
      supabase.from('purchase_bill_items').select('*').order('sort_order'),
    ]);

    // Surface partial load failures instead of silently showing empty lists.
    const failedLoads = [
      settingsRes, customersRes, vendorsRes, invoicesRes, itemsRes, quotationsRes, quotationPaymentsRes, expensesRes,
      vendorPurchasesRes, vendorPaymentsRes, monthlyRes, workersRes, workerAdvancesRes, workerPaymentsRes, linksRes,
      summaryRes, priceListRes, vendorSlipsRes, vendorSlipItemsRes, purchaseBillsRes, purchaseBillItemsRes,
    ].filter((r) => r.error);
    if (failedLoads.length > 0) {
      console.error('[loadAllData] failed requests:', failedLoads.map((r) => r.error));
      showToast(`Some data could not be loaded (${failedLoads.length} request${failedLoads.length > 1 ? 's' : ''} failed). Refresh to retry.`, 'error');
    }

    if (settingsRes.data) setGstEnabled(settingsRes.data.gst_enabled);
    if (customersRes.data) setCustomers(customersRes.data.map(mapCustomerBalance));
    if (vendorsRes.data) setVendors(vendorsRes.data.map(mapVendorBalance));

    if (invoicesRes.data) {
      const itemsByInvoice = new Map<string, InvoiceItem[]>();
      (itemsRes.data ?? []).forEach((row: any) => {
        const list = itemsByInvoice.get(row.invoice_id) ?? [];
        list.push(mapInvoiceItem(row));
        itemsByInvoice.set(row.invoice_id, list);
      });
      setInvoices(invoicesRes.data.map((row: any) => mapInvoice(row, itemsByInvoice.get(row.id) ?? [])));
    }

    if (quotationsRes.data) setQuotations(quotationsRes.data.map(mapQuotation));
    if (quotationPaymentsRes.data) setQuotationPayments(quotationPaymentsRes.data.map(mapQuotationPayment));
    if (expensesRes.data) setExpenses(expensesRes.data.map(mapExpense));
    if (vendorPurchasesRes.data) setVendorPurchases(vendorPurchasesRes.data.map(mapVendorPurchase));
    if (vendorPaymentsRes.data) setVendorPayments(vendorPaymentsRes.data.map(mapVendorPayment));
    if (monthlyRes.data) setMonthlyFigures(monthlyRes.data.map(mapMonthlyFigure));
    if (workersRes.data) setWorkers(workersRes.data.map(mapWorker));
    if (workerAdvancesRes.data) setWorkerAdvances(workerAdvancesRes.data.map(mapWorkerAdvance));
    if (workerPaymentsRes.data) setWorkerPayments(workerPaymentsRes.data.map(mapWorkerPayment));
    if (linksRes.data) setLinks(linksRes.data.map(mapImportantLink));
    if (summaryRes.data) setDashboardSummary(mapDashboardSummary(summaryRes.data));
    if (priceListRes.data) setPriceList(priceListRes.data.map(mapPriceListItem));

    if (vendorSlipsRes.data) {
      const itemsBySlip = new Map<string, VendorSlipItem[]>();
      (vendorSlipItemsRes.data ?? []).forEach((row: any) => {
        const list = itemsBySlip.get(row.slip_id) ?? [];
        list.push(mapVendorSlipItem(row));
        itemsBySlip.set(row.slip_id, list);
      });
      setVendorSlips(vendorSlipsRes.data.map((row: any) => mapVendorSlip(row, itemsBySlip.get(row.id) ?? [])));
    }

    if (purchaseBillsRes.data) {
      const itemsByBill = new Map<string, PurchaseBillItem[]>();
      (purchaseBillItemsRes.data ?? []).forEach((row: any) => {
        const list = itemsByBill.get(row.bill_id) ?? [];
        list.push(mapPurchaseBillItem(row));
        itemsByBill.set(row.bill_id, list);
      });
      setPurchaseBills(purchaseBillsRes.data.map((row: any) => mapPurchaseBill(row, itemsByBill.get(row.id) ?? [])));
    }

    setDataLoading(false);
    setHasLoadedOnce(true);
  }, [showToast]);

  // ---------- Auth bootstrap ----------
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
    });

    // supabase-js re-fires this on every tab refocus (a background token
    // refresh check), even when it's the exact same signed-in user — not
    // just on real sign-in/sign-out. Replacing `session` with a new object
    // reference every time was triggering a full loadAllData() re-fetch
    // (see the effect below) purely from switching tabs and back, which
    // in turn was unmounting the whole page tree — see dataLoading/
    // hasLoadedOnce in ProtectedShell (App.tsx). Only update session when
    // the signed-in user actually changes.
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession((prev) => (prev?.user?.id === newSession?.user?.id ? prev : newSession));
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setCurrentUserName(null);
      setCurrentUserRole(null);
      return;
    }
    supabase
      .from('profiles')
      .select('display_name, role, is_active')
      .eq('id', session.user.id)
      .single()
      .then(async ({ data }) => {
        // Someone switched this login off (see Employee Control) while
        // it happened to have a lingering session — deny entry the same
        // as a fresh sign-in would, rather than letting the app load.
        if (data && data.is_active === false) {
          setAccessDeniedMessage('Your access has been switched off. Contact the business owner.');
          await supabase.auth.signOut();
          return;
        }
        setCurrentUserName(data?.display_name ?? session.user.email ?? null);
        setCurrentUserRole(data?.role === 'owner' ? 'owner' : 'employee');
      });
    loadAllData();
  }, [session, loadAllData]);

  // Catches the case where someone's access is switched off WHILE they're
  // already using the app — the check above only runs once, right when a
  // session first appears. Re-checked periodically, and immediately when
  // the tab/app comes back into view (covers a phone being reopened after
  // being backgrounded, which is the more common way this matters on
  // mobile than an actual page reload).
  useEffect(() => {
    if (!session) return;
    let cancelled = false;

    const checkStillActive = async () => {
      const { data } = await supabase.from('profiles').select('is_active').eq('id', session.user.id).single();
      if (cancelled) return;
      if (data && data.is_active === false) {
        setAccessDeniedMessage('Your access has been switched off. Contact the business owner.');
        await supabase.auth.signOut();
      }
    };

    const intervalId = window.setInterval(checkStillActive, 60000);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') checkStillActive();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [session]);

  // ---------- Employee control (owner only) ----------
  const refreshEmployees = useCallback(async () => {
    const { data } = await supabase.from('profiles').select('*').order('display_name');
    if (data) setEmployees(data.map(mapEmployeeProfile));
  }, []);

  useEffect(() => {
    if (currentUserRole === 'owner') refreshEmployees();
  }, [currentUserRole, refreshEmployees]);

  const setEmployeeActive = async (id: string, isActive: boolean): Promise<string | null> => {
    const { error } = await supabase.from('profiles').update({ is_active: isActive }).eq('id', id);
    if (error) return error.message;
    setEmployees((prev) => prev.map((e) => (e.id === id ? { ...e, isActive } : e)));
    return null;
  };

  // create/delete both go through the manage-employee Edge Function,
  // which is the only place the Supabase service-role key lives — this
  // app otherwise never has permission to create or remove a login.
  const createEmployee = async (input: { displayName: string; email: string; password: string }): Promise<string | null> => {
    const { data, error } = await supabase.functions.invoke('manage-employee', {
      body: { action: 'create', ...input },
    });
    const remoteError = (data as { error?: string } | null)?.error;
    if (error || remoteError) return remoteError ?? error?.message ?? 'Could not create the login.';
    await refreshEmployees();
    return null;
  };

  const deleteEmployee = async (id: string): Promise<string | null> => {
    const { data, error } = await supabase.functions.invoke('manage-employee', {
      body: { action: 'delete', id },
    });
    const remoteError = (data as { error?: string } | null)?.error;
    if (error || remoteError) return remoteError ?? error?.message ?? 'Could not delete the login.';
    setEmployees((prev) => prev.filter((e) => e.id !== id));
    return null;
  };

  // ---------- Auth actions ----------
  const login = async (email: string, password: string): Promise<{ name: string } | { error: string }> => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.session) return { error: 'Incorrect email or password.' };

    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name, is_active')
      .eq('id', data.session.user.id)
      .single();

    if (profile && profile.is_active === false) {
      await supabase.auth.signOut();
      return { error: 'Your access has been switched off. Contact the business owner.' };
    }

    return { name: profile?.display_name ?? data.session.user.email ?? 'there' };
  };

  const logout = async () => {
    await supabase.auth.signOut();
  };

  // ---------- Settings ----------
  const toggleGst = async () => {
    const next = !gstEnabled;
    setGstEnabled(next);
    const { error } = await supabase.from('business_settings').update({ gst_enabled: next }).eq('id', true);
    if (error) {
      setGstEnabled(!next);
      reportError('Changing GST setting', error);
    }
  };

  // ---------- Customers / Vendors ----------
  const addCustomer = async (input: NewCustomerInput): Promise<Customer | null> => {
    const { data, error } = await supabase
      .from('customers')
      .insert({ name: input.name, contact: input.contact || null, address: input.address || null, gstin: input.gstin || null })
      .select()
      .single();
    if (error || !data) {
      reportError('Saving customer', error);
      return null;
    }
    const newCustomer: Customer = {
      id: data.id,
      name: data.name,
      contact: data.contact,
      address: data.address ?? undefined,
      gstin: data.gstin ?? undefined,
      totalBilled: 0,
      outstanding: 0,
    };
    setCustomers((prev) => [newCustomer, ...prev]);
    return newCustomer;
  };

  const addVendor = async (input: NewVendorInput): Promise<Vendor | null> => {
    const { data, error } = await supabase
      .from('vendors')
      .insert({ name: input.name, category: input.category, contact: input.contact })
      .select()
      .single();
    if (error || !data) {
      reportError('Saving vendor', error);
      return null;
    }
    const newVendor: Vendor = {
      id: data.id,
      name: data.name,
      category: data.category,
      contact: data.contact,
      totalPurchased: 0,
      payable: 0,
    };
    setVendors((prev) => [newVendor, ...prev]);
    return newVendor;
  };

  const updateCustomer = async (id: string, input: NewCustomerInput): Promise<boolean> => {
    const { error } = await supabase
      .from('customers')
      .update({ name: input.name, contact: input.contact || null, address: input.address || null, gstin: input.gstin || null })
      .eq('id', id);
    if (error) {
      reportError('Updating customer', error);
      return false;
    }
    await refreshCustomers();
    return true;
  };

  const updateVendor = async (id: string, input: NewVendorInput): Promise<boolean> => {
    const { error } = await supabase
      .from('vendors')
      .update({ name: input.name, category: input.category, contact: input.contact })
      .eq('id', id);
    if (error) {
      reportError('Updating vendor', error);
      return false;
    }
    await refreshVendors();
    return true;
  };

  // ---------- Expenses (non-vendor only) ----------
  const addExpense = async (input: NewExpenseInput): Promise<boolean> => {
    const { data, error } = await supabase
      .from('expenses')
      .insert({
        category: input.category,
        vendor_id: null,
        description: input.description,
        amount: input.amount,
        expense_date: input.date,
        is_paid: true,
      })
      .select()
      .single();
    if (error || !data) {
      reportError('Saving expense', error);
      return false;
    }
    setExpenses((prev) => [mapExpense(data), ...prev]);
    return true;
  };

  // ---------- Vendor purchases ----------
  const addVendorPurchase = async (input: NewVendorPurchaseInput): Promise<boolean> => {
    const { data, error } = await supabase
      .from('expenses')
      .insert({
        category: input.category,
        vendor_id: input.vendorId,
        description: input.description,
        amount: input.amount,
        expense_date: input.date,
        is_paid: false,
      })
      .select()
      .single();
    if (error || !data) {
      reportError('Saving purchase', error);
      return false;
    }
    setVendorPurchases((prev) => [
      {
        id: data.id,
        vendorId: input.vendorId,
        category: input.category,
        description: input.description,
        amount: input.amount,
        date: input.date,
        paidAmount: 0,
        balance: input.amount,
        paymentStatus: 'unpaid',
      },
      ...prev,
    ]);
    await refreshVendors();
    return true;
  };

  // Pays down a vendor's total payable in one shot — the RPC allocates the
  // amount across that vendor's outstanding purchases oldest-first, so
  // individual purchase/slip statuses still update correctly underneath.
  const recordVendorPayment = async (vendorId: string, amount: number, note?: string): Promise<boolean> => {
    const { error } = await supabase.rpc('record_vendor_payment', {
      p_vendor_id: vendorId,
      p_amount: amount,
      p_note: note || null,
    });
    if (error) {
      reportError('Recording vendor payment', error);
      return false;
    }
    await Promise.all([refreshVendorPurchases(), refreshVendors(), refreshVendorPayments()]);
    return true;
  };

  // ---------- Vendor slips (DC) ----------
  // Created with quantities only — no prices. Printed, sent to the vendor,
  // and re-opened later (see priceVendorSlip) once the vendor's rates come
  // back. Mirrors addVendorPurchase's insert-then-fetch shape rather than
  // an RPC, since there's nothing transactional to protect yet — the
  // pricing step is where atomicity (and the lock) actually matters.
  const addVendorSlip = async (input: NewVendorSlipInput): Promise<VendorSlip | null> => {
    if (input.items.length === 0) return null;

    const { data: slipRow, error: slipErr } = await supabase
      .from('vendor_slips')
      .insert({ vendor_id: input.vendorId, care_of: input.careOf, customer_name: input.customerName?.trim() || null })
      .select()
      .single();
    if (slipErr || !slipRow) {
      reportError('Saving slip', slipErr);
      return null;
    }

    const itemRows = input.items.map((it, idx) => ({
      slip_id: slipRow.id,
      description: it.description,
      quantity: it.quantity,
      unit: it.unit,
      sort_order: idx,
    }));

    const { error: itemsErr } = await supabase.from('vendor_slip_items').insert(itemRows);
    if (itemsErr) {
      await supabase.from('vendor_slips').delete().eq('id', slipRow.id);
      reportError('Saving slip items', itemsErr);
      return null;
    }

    const { data: itemsData } = await supabase
      .from('vendor_slip_items')
      .select('*')
      .eq('slip_id', slipRow.id)
      .order('sort_order');
    const newSlip = mapVendorSlip(slipRow, (itemsData ?? []).map(mapVendorSlipItem));
    setVendorSlips((prev) => [newSlip, ...prev]);
    return newSlip;
  };

  // Fills in rate/amount per line, totals the slip, creates the matching
  // expense row, and locks it — all atomically via the RPC. Once this
  // resolves the slip behaves like any other vendor purchase (payable,
  // Record Payment, etc.) via refreshVendorPurchases/refreshVendors.
  const priceVendorSlip = async (slipId: string, itemRates: { itemId: string; rate: number }[]): Promise<boolean> => {
    const { error } = await supabase.rpc('price_vendor_slip', {
      p_slip_id: slipId,
      p_items: itemRates.map((r) => ({ id: r.itemId, rate: r.rate })),
    });
    if (error) {
      reportError('Saving slip prices', error);
      return false;
    }
    await Promise.all([refreshVendorSlips(), refreshVendorPurchases(), refreshVendors()]);
    return true;
  };

  // ---------- Purchase bills (GST purchase register) ----------
  // Pure compliance log — a standalone record of a supplier's tax invoice,
  // never touches payable/payments. Deliberately NOT linked to vendors —
  // suppliers and vendors are treated as separate concepts by the client,
  // and there's no confirmed Suppliers tab yet.
  const addPurchaseBill = async (input: NewPurchaseBillInput): Promise<PurchaseBill | null> => {
    if (input.items.length === 0) return null;

    const computedItems = input.items.map((it) => {
      const taxable = Math.round(it.quantity * it.rate * 100) / 100;
      const gstAmount = Math.round(taxable * (it.gstRate / 100) * 100) / 100;
      const cgst = input.taxType === 'cgst_sgst' ? Math.round((gstAmount / 2) * 100) / 100 : 0;
      const sgst = input.taxType === 'cgst_sgst' ? Math.round((gstAmount - cgst) * 100) / 100 : 0;
      const igst = input.taxType === 'igst' ? gstAmount : 0;
      return { ...it, taxable, cgst, sgst, igst };
    });

    const subtotal = Math.round(computedItems.reduce((s, i) => s + i.taxable, 0) * 100) / 100;
    const cgstTotal = Math.round(computedItems.reduce((s, i) => s + i.cgst, 0) * 100) / 100;
    const sgstTotal = Math.round(computedItems.reduce((s, i) => s + i.sgst, 0) * 100) / 100;
    const igstTotal = Math.round(computedItems.reduce((s, i) => s + i.igst, 0) * 100) / 100;
    const totalAmount = Math.round((subtotal + cgstTotal + sgstTotal + igstTotal) * 100) / 100;

    const { data: billRow, error: billErr } = await supabase
      .from('purchase_bills')
      .insert({
        supplier_gstin: input.supplierGstin.trim().toUpperCase(),
        supplier_name: input.supplierName,
        supplier_address: input.supplierAddress || null,
        invoice_no: input.invoiceNo,
        invoice_date: input.invoiceDate,
        place_of_supply: input.placeOfSupply,
        tax_type: input.taxType,
        subtotal,
        cgst_total: cgstTotal,
        sgst_total: sgstTotal,
        igst_total: igstTotal,
        total_amount: totalAmount,
      })
      .select()
      .single();
    if (billErr || !billRow) {
      reportError('Saving purchase bill', billErr);
      return null;
    }

    const itemRows = computedItems.map((it, idx) => ({
      bill_id: billRow.id,
      hsn_code: it.hsnCode || null,
      description: it.description,
      quantity: it.quantity,
      rate: it.rate,
      taxable_amount: it.taxable,
      gst_rate: it.gstRate,
      cgst_amount: it.cgst,
      sgst_amount: it.sgst,
      igst_amount: it.igst,
      sort_order: idx,
    }));

    const { error: itemsErr } = await supabase.from('purchase_bill_items').insert(itemRows);
    if (itemsErr) {
      await supabase.from('purchase_bills').delete().eq('id', billRow.id);
      reportError('Saving purchase bill items', itemsErr);
      return null;
    }

    const { data: itemsData } = await supabase
      .from('purchase_bill_items')
      .select('*')
      .eq('bill_id', billRow.id)
      .order('sort_order');
    const newBill = mapPurchaseBill(billRow, (itemsData ?? []).map(mapPurchaseBillItem));
    setPurchaseBills((prev) => [newBill, ...prev]);
    return newBill;
  };

  // ---------- Invoices ----------
  // Undoes a conversion: hard-deletes the invoice (and its items, via
  // cascade) and reopens its source quotation as 'pending' again. The
  // quotation's payment history was never moved anywhere by conversion in
  // the first place, so nothing needs restoring — it just picks back up.
  const rollbackInvoiceToQuotation = async (invoiceDbId: string): Promise<string | null> => {
    const { error } = await supabase.rpc('rollback_invoice_to_quotation', { p_invoice_id: invoiceDbId });
    // Previously just `if (error) return;` — failed completely silently,
    // which is exactly why this was so hard to diagnose: nothing visibly
    // happened and nothing said why. Now the actual Postgres error
    // message (permission denied, function signature mismatch, whatever
    // it turns out to be) surfaces in the UI instead of vanishing here.
    if (error) return error.message;
    setInvoices((prev) => prev.filter((i) => i.dbId !== invoiceDbId));
    await Promise.all([refreshQuotations(), refreshCustomers(), refreshDashboardSummary()]);
    return null;
  };

  // ---------- Quotations ----------
  // All arithmetic lives in lib/quotationMath.ts, shared with
  // QuotationModal so the live preview always equals what gets saved.
  function quotationLineAmount(i: NewQuotationItemInput): number {
    return i.type === 'glass' ? glassLine(i).amount : simpleLine(i.quantity, i.rate).amount;
  }

  function buildQuotationItemRows(quotationId: string, items: NewQuotationItemInput[]) {
    return items.map((i, idx) => {
      if (i.type === 'glass') {
        const c = glassLine(i);
        return {
          quotation_id: quotationId,
          item_type: 'glass',
          description: i.description,
          area: i.area || null,
          sort_order: idx,
          thickness_mm: i.thicknessMm || null,
          length_in: i.lengthIn,
          width_in: i.widthIn,
          glass_qty: i.qty,
          rate_per_sft: i.ratePerSft,
          sft: c.sft,
          work_glass_amount: c.workGlass,
          rft: c.rft,
          polish_rate: i.polishRate || 0,
          polish_amount: c.polishAmt,
          fixing_rate_per_sft: i.fixingRatePerSft || 0,
          fixing_amount: c.fixingAmt,
          amount: c.amount,
        };
      }
      const s = simpleLine(i.quantity, i.rate);
      return {
        quotation_id: quotationId,
        item_type: 'simple',
        description: i.description,
        area: i.area || null,
        sort_order: idx,
        quantity: i.quantity,
        rate: i.rate,
        amount: s.amount,
      };
    });
  }

  // Reloads a quotation's line items in the same shape QuotationModal's
  // draft rows use, so editing a quotation actually starts from what's
  // really saved instead of an empty form.
  const fetchQuotationItems = useCallback(async (quotationDbId: string): Promise<NewQuotationItemInput[]> => {
    const { data } = await supabase.from('quotation_items').select('*').eq('quotation_id', quotationDbId).order('sort_order');
    return (data ?? []).map((it: any): NewQuotationItemInput =>
      it.item_type === 'glass'
        ? {
            type: 'glass',
            description: it.description,
            area: it.area,
            thicknessMm: it.thickness_mm,
            lengthIn: Number(it.length_in),
            widthIn: Number(it.width_in),
            qty: Number(it.glass_qty),
            ratePerSft: Number(it.rate_per_sft),
            polishRate: Number(it.polish_rate ?? 0),
            fixingRatePerSft: Number(it.fixing_rate_per_sft ?? 0),
          }
        : {
            type: 'simple',
            description: it.description,
            area: it.area,
            quantity: Number(it.quantity),
            rate: Number(it.rate),
          }
    );
  }, []);

  // Unlike fetchQuotationItems above (which returns the editable draft
  // shape for QuotationModal, with no computed sft/rft/amount), this
  // returns the same fully-computed item shape invoices use — needed so
  // PrintableDocument can show a quotation's real itemized Glass
  // Work/Hardware rows instead of one collapsed summary line.
  const fetchQuotationItemsForPrint = useCallback(async (quotationDbId: string): Promise<QuotationItem[]> => {
    const { data } = await supabase.from('quotation_items').select('*').eq('quotation_id', quotationDbId).order('sort_order');
    return (data ?? []).map(mapQuotationItem);
  }, []);

  const addQuotation = async (input: NewQuotationInput): Promise<Quotation | null> => {
    const subtotal = input.items.reduce((sum, i) => sum + quotationLineAmount(i), 0);
    if (subtotal <= 0) {
      showToast('A quotation needs at least one priced item.', 'error');
      return null;
    }
    const discountPercent = input.slab === 'A' ? input.discountPercent || 0 : SLAB_DISCOUNT_PERCENT[input.slab];
    const totals = quotationTotals(subtotal, discountPercent, input.gstEnabled ?? gstEnabled, input.transportation);
    const summary = input.items.slice(0, 3).map((i) => i.description).join(', ') || 'Quotation';

    const { data: qRow, error: qErr } = await supabase
      .from('quotations')
      .insert({
        customer_id: input.customerId,
        description: summary,
        amount: totals.subtotal,
        slab: input.slab,
        discount_percent: discountPercent,
        discount_amount: totals.discountAmount,
        gst: totals.gst,
        transportation: input.transportation || 0,
        valid_until: input.validUntil,
      })
      .select()
      .single();
    if (qErr || !qRow) {
      reportError('Saving quotation', qErr);
      return null;
    }

    const itemRows = buildQuotationItemRows(qRow.id, input.items);
    const { error: itemsErr } = await supabase.from('quotation_items').insert(itemRows);
    if (itemsErr) {
      await supabase.from('quotations').delete().eq('id', qRow.id);
      reportError('Saving quotation items', itemsErr);
      return null;
    }

    // Re-fetch from the effective view rather than mapping qRow directly —
    // the plain insert() result has no paid_amount/grand_total/
    // effective_status columns, only quotations_effective computes those.
    const { data: effRow } = await supabase.from('quotations_effective').select('*').eq('id', qRow.id).single();
    const newQuotation = mapQuotation(effRow ?? qRow);
    setQuotations((prev) => [newQuotation, ...prev]);
    return newQuotation;
  };

  // Compact view of a quotation's money-relevant fields, used for the
  // before/after audit log written on every edit.
  const auditHeader = (h: any) => ({
    amount: h.amount,
    slab: h.slab,
    discount_percent: h.discount_percent,
    discount_amount: h.discount_amount,
    gst: h.gst,
    transportation: h.transportation,
    valid_until: h.valid_until,
  });
  const auditItem = (it: any) => ({
    item_type: it.item_type,
    description: it.description,
    length_in: it.length_in ?? null,
    width_in: it.width_in ?? null,
    glass_qty: it.glass_qty ?? null,
    rate_per_sft: it.rate_per_sft ?? null,
    polish_rate: it.polish_rate ?? null,
    fixing_rate_per_sft: it.fixing_rate_per_sft ?? null,
    quantity: it.quantity ?? null,
    rate: it.rate ?? null,
    amount: it.amount,
  });

  // Edit is a swap done in a safe order instead of delete-then-insert:
  //   1. insert the NEW item rows (old ones untouched — a failure here
  //      changes nothing)
  //   2. update the header totals (failure -> remove the new rows)
  //   3. delete the OLD item rows (failure -> remove new rows, restore
  //      the old header)
  // so a failure at any step can no longer leave a quotation with a total
  // and no items. GST follows input.gstEnabled (what the quotation had,
  // as confirmed in the modal) — NOT the current global switch.
  const updateQuotation = async (quotationDbId: string, input: EditQuotationInput): Promise<boolean> => {
    const subtotal = input.items.reduce((sum, i) => sum + quotationLineAmount(i), 0);
    if (subtotal <= 0) {
      showToast('A quotation needs at least one priced item.', 'error');
      return false;
    }
    const discountPercent = input.slab === 'A' ? input.discountPercent || 0 : SLAB_DISCOUNT_PERCENT[input.slab];
    const totals = quotationTotals(subtotal, discountPercent, input.gstEnabled, input.transportation);
    const summary = input.items.slice(0, 3).map((i) => i.description).join(', ') || 'Quotation';

    const [{ data: oldHeader, error: oldHeaderErr }, { data: oldItems, error: oldItemsErr }] = await Promise.all([
      supabase.from('quotations').select('*').eq('id', quotationDbId).single(),
      supabase.from('quotation_items').select('*').eq('quotation_id', quotationDbId).order('sort_order'),
    ]);
    if (oldHeaderErr || !oldHeader || oldItemsErr) {
      reportError('Loading quotation for edit', oldHeaderErr ?? oldItemsErr);
      return false;
    }

    const itemRows = buildQuotationItemRows(quotationDbId, input.items);
    const { data: inserted, error: insErr } = await supabase.from('quotation_items').insert(itemRows).select('id');
    if (insErr || !inserted) {
      reportError('Saving quotation items', insErr);
      return false;
    }
    const newIds = inserted.map((r: any) => r.id);
    const removeNewItems = () => supabase.from('quotation_items').delete().in('id', newIds);

    const { data: qRow, error: qErr } = await supabase
      .from('quotations')
      .update({
        description: summary,
        amount: totals.subtotal,
        slab: input.slab,
        discount_percent: discountPercent,
        discount_amount: totals.discountAmount,
        gst: totals.gst,
        transportation: input.transportation || 0,
        valid_until: input.validUntil,
      })
      .eq('id', quotationDbId)
      .select()
      .single();
    if (qErr || !qRow) {
      await removeNewItems();
      reportError('Saving quotation', qErr);
      return false;
    }

    const oldIds = (oldItems ?? []).map((r: any) => r.id);
    if (oldIds.length > 0) {
      const { error: delErr } = await supabase.from('quotation_items').delete().in('id', oldIds);
      if (delErr) {
        await removeNewItems();
        await supabase
          .from('quotations')
          .update({
            description: oldHeader.description,
            amount: oldHeader.amount,
            slab: oldHeader.slab,
            discount_percent: oldHeader.discount_percent,
            discount_amount: oldHeader.discount_amount,
            gst: oldHeader.gst,
            transportation: oldHeader.transportation,
            valid_until: oldHeader.valid_until,
          })
          .eq('id', quotationDbId);
        reportError('Replacing quotation items', delErr);
        return false;
      }
    }

    // Best-effort audit trail (table comes from migration 006). Never blocks
    // or fails the save if the table isn't there yet.
    try {
      const { data: auth } = await supabase.auth.getUser();
      const { error: auditErr } = await supabase.from('quotation_changes').insert({
        quotation_id: quotationDbId,
        changed_by: auth.user?.id ?? null,
        before_state: { header: auditHeader(oldHeader), items: (oldItems ?? []).map(auditItem) },
        after_state: { header: auditHeader(qRow), items: itemRows.map(auditItem) },
      });
      if (auditErr) console.warn('quotation_changes not written:', auditErr.message);
    } catch (e) {
      console.warn('quotation_changes not written:', e);
    }

    const { data: effRow } = await supabase.from('quotations_effective').select('*').eq('id', quotationDbId).single();
    const updated = mapQuotation(effRow ?? qRow);
    setQuotations((prev) => prev.map((q) => (q.dbId === quotationDbId ? updated : q)));
    return true;
  };

  // Single atomic server-side call now (see convert_quotation_to_invoice in
  // schema.sql) — the RPC re-validates the balance is actually zero,
  // copies quotation_items -> invoice_items itself (area + thickness_mm
  // included, since it's one SQL statement rather than several sequential
  // client inserts), and flips the quotation to 'converted'. No slab
  // confirmation step anymore: the slab was already freely editable for
  // the entire life of the quotation via QuotationModal, so there's
  // nothing left to confirm at conversion time.
  const convertQuotationToInvoice = async (quotationDbId: string): Promise<Invoice | null> => {
    const { data: invRow, error } = await supabase.rpc('convert_quotation_to_invoice', {
      p_quotation_id: quotationDbId,
    });
    if (error || !invRow) {
      reportError('Converting to invoice', error);
      return null;
    }

    const full = await fetchInvoiceById(invRow.id);
    if (full) setInvoices((prev) => [full, ...prev]);
    await Promise.all([refreshQuotations(), refreshCustomers(), refreshDashboardSummary()]);
    return full;
  };

  // Hard delete — only reachable for a 'pending' quotation with zero
  // payments recorded (UI also hides the option once status = 'converted'
  // or paidAmount > 0, so the payment ledger is never silently lost).
  const deleteQuotation = async (quotationDbId: string): Promise<boolean> => {
    const { error } = await supabase.from('quotations').delete().eq('id', quotationDbId);
    if (error) {
      reportError('Deleting quotation', error);
      return false;
    }
    setQuotations((prev) => prev.filter((q) => q.dbId !== quotationDbId));
    return true;
  };

  // ---------- Quotation payments ----------
  // Records one installment against a quotation's running balance. Plain
  // scalar RPC params only (see the note at the top of schema.sql's
  // Functions section) — this is the entire payment ledger for the bill,
  // shown on the Ledger printable and never moved even after conversion.
  const recordQuotationPayment = async (
    quotationDbId: string,
    amount: number,
    method: PaymentMethod,
    note?: string
  ): Promise<PaymentReceipt | null> => {
    const { data, error } = await supabase.rpc('record_quotation_payment', {
      p_quotation_id: quotationDbId,
      p_amount: amount,
      p_method: method,
      p_note: note || null,
    });
    if (error || !data) {
      reportError('Recording payment', error);
      return null;
    }

    await Promise.all([refreshQuotations(), refreshQuotationPayments(), refreshCustomers(), refreshDashboardSummary()]);

    const updatedQuotation = await supabase.from('quotations_effective').select('*').eq('id', quotationDbId).single();
    if (!updatedQuotation.data) return null;
    const quotation = mapQuotation(updatedQuotation.data);

    const receipt: PaymentReceipt = {
      paymentAmount: Number(data.amount),
      paymentDate: data.payment_date,
      method: data.method,
      note: data.note ?? undefined,
      quotation,
    };
    setPaymentReceipt(receipt);
    return receipt;
  };

  // ---------- Workers / Payslips ----------
  const addWorker = async (input: NewWorkerInput): Promise<boolean> => {
    const { data, error } = await supabase
      .from('workers')
      .insert({ name: input.name, monthly_salary: input.monthlySalary })
      .select()
      .single();
    if (error || !data) {
      reportError('Saving worker', error);
      return false;
    }
    const newWorker: Worker = {
      id: data.id,
      name: data.name,
      monthlySalary: Number(data.monthly_salary),
      advancesThisMonth: 0,
      paidThisMonth: 0,
      remainingThisMonth: Number(data.monthly_salary),
    };
    setWorkers((prev) => [...prev, newWorker].sort((a, b) => a.name.localeCompare(b.name)));
    return true;
  };

  const updateWorker = async (workerId: string, input: NewWorkerInput): Promise<boolean> => {
    const { error } = await supabase
      .from('workers')
      .update({ name: input.name, monthly_salary: input.monthlySalary })
      .eq('id', workerId);
    if (error) {
      reportError('Updating worker', error);
      return false;
    }
    await refreshWorkers();
    return true;
  };

  const logWorkerAdvance = async (input: NewWorkerAdvanceInput): Promise<boolean> => {
    const { error } = await supabase.rpc('log_worker_advance', {
      p_worker_id: input.workerId,
      p_amount: input.amount,
      p_date: input.date,
      p_note: input.note ?? '',
    });
    if (error) {
      reportError('Logging advance', error);
      return false;
    }
    await Promise.all([refreshWorkers(), refreshExpenses(), refreshWorkerAdvances()]);
    return true;
  };

  // Records a salary SETTLEMENT payment — distinct from an advance. Always
  // creates a matching expense row (same pattern as advances), so total
  // payroll spend shows up correctly in Expenses/Reports.
  const recordWorkerPayment = async (workerId: string, amount: number, date: string, forMonth: string, note?: string): Promise<boolean> => {
    const { error } = await supabase.rpc('record_worker_payment', {
      p_worker_id: workerId,
      p_amount: amount,
      p_date: date,
      p_for_month: forMonth,
      p_note: note || null,
    });
    if (error) {
      reportError('Recording salary payment', error);
      return false;
    }
    await Promise.all([refreshWorkers(), refreshExpenses(), refreshWorkerPayments()]);
    return true;
  };

  // ---------- Important Links ----------
  const addLink = async (input: NewLinkInput): Promise<boolean> => {
    const { data, error } = await supabase
      .from('important_links')
      .insert({ label: input.label, url: input.url, category: input.category || null, sort_order: links.length })
      .select()
      .single();
    if (error || !data) {
      reportError('Saving link', error);
      return false;
    }
    setLinks((prev) => [...prev, mapImportantLink(data)]);
    return true;
  };

  // ---------- Price List ----------
  const addPriceListItem = async (input: NewPriceListItemInput): Promise<boolean> => {
    const { data, error } = await supabase
      .from('price_list')
      .insert({
        description: input.description,
        rate_per_sft: input.ratePerSft,
        polish_rate: input.polishRate,
        fixing_rate: input.fixingRate,
        sort_order: priceList.length,
      })
      .select()
      .single();
    if (error || !data) {
      reportError('Saving product', error);
      return false;
    }
    setPriceList((prev) => [...prev, mapPriceListItem(data)]);
    return true;
  };

  const updatePriceListItem = async (id: string, input: NewPriceListItemInput): Promise<boolean> => {
    const { data, error } = await supabase
      .from('price_list')
      .update({
        description: input.description,
        rate_per_sft: input.ratePerSft,
        polish_rate: input.polishRate,
        fixing_rate: input.fixingRate,
      })
      .eq('id', id)
      .select()
      .single();
    if (error || !data) {
      reportError('Updating product', error);
      return false;
    }
    setPriceList((prev) => prev.map((p) => (p.id === id ? mapPriceListItem(data) : p)));
    return true;
  };

  const deletePriceListItem = async (id: string): Promise<boolean> => {
    const { error } = await supabase.from('price_list').delete().eq('id', id);
    if (error) {
      reportError('Deleting product', error);
      return false;
    }
    setPriceList((prev) => prev.filter((p) => p.id !== id));
    return true;
  };

  const value = useMemo<AppContextValue>(
    () => ({
      gstEnabled,
      // Every mutating action below is wrapped with guardMobile — a
      // second layer behind the UI's `desktop-only` classes (see
      // src/lib/mobileGuard.ts). Read-only values, fetches, and modal
      // open/close toggles are passed through unwrapped.
      toggleGst: guardMobile(toggleGst, isMobileView),
      toast,
      showToast,
      dismissToast,
      customers,
      addCustomer: guardMobile(addCustomer, isMobileView),
      updateCustomer: guardMobile(updateCustomer, isMobileView),
      vendors,
      addVendor: guardMobile(addVendor, isMobileView),
      updateVendor: guardMobile(updateVendor, isMobileView),
      expenses,
      addExpense: guardMobile(addExpense, isMobileView),
      vendorPurchases,
      vendorPayments,
      addVendorPurchase: guardMobile(addVendorPurchase, isMobileView),
      recordVendorPayment: guardMobile(recordVendorPayment, isMobileView),
      vendorSlips,
      addVendorSlip: guardMobile(addVendorSlip, isMobileView),
      priceVendorSlip: guardMobile(priceVendorSlip, isMobileView),
      purchaseBills,
      addPurchaseBill: guardMobile(addPurchaseBill, isMobileView),
      monthlyFigures,
      dashboardSummary,
      invoices,
      rollbackInvoiceToQuotation: guardMobile(rollbackInvoiceToQuotation, isMobileView),
      quotations,
      addQuotation: guardMobile(addQuotation, isMobileView),
      updateQuotation: guardMobile(updateQuotation, isMobileView),
      fetchQuotationItems,
      fetchQuotationItemsForPrint,
      convertQuotationToInvoice: guardMobile(convertQuotationToInvoice, isMobileView),
      deleteQuotation: guardMobile(deleteQuotation, isMobileView),
      quotationPayments,
      recordQuotationPayment: guardMobile(recordQuotationPayment, isMobileView),
      workers,
      addWorker: guardMobile(addWorker, isMobileView),
      updateWorker: guardMobile(updateWorker, isMobileView),
      workerAdvances,
      logWorkerAdvance: guardMobile(logWorkerAdvance, isMobileView),
      workerPayments,
      recordWorkerPayment: guardMobile(recordWorkerPayment, isMobileView),
      links,
      addLink: guardMobile(addLink, isMobileView),
      priceList,
      addPriceListItem: guardMobile(addPriceListItem, isMobileView),
      updatePriceListItem: guardMobile(updatePriceListItem, isMobileView),
      deletePriceListItem: guardMobile(deletePriceListItem, isMobileView),
      isCustomerModalOpen,
      editingCustomerId,
      openCustomerModal: () => {
        setEditingCustomerId(null);
        setCustomerModalOpen(true);
      },
      openEditCustomerModal: (customerId: string) => {
        setEditingCustomerId(customerId);
        setCustomerModalOpen(true);
      },
      closeCustomerModal: () => {
        setCustomerModalOpen(false);
        setEditingCustomerId(null);
      },
      isVendorModalOpen,
      editingVendorId,
      openVendorModal: () => {
        setEditingVendorId(null);
        setVendorModalOpen(true);
      },
      openEditVendorModal: (vendorId: string) => {
        setEditingVendorId(vendorId);
        setVendorModalOpen(true);
      },
      closeVendorModal: () => {
        setVendorModalOpen(false);
        setEditingVendorId(null);
      },
      isExpenseModalOpen,
      openExpenseModal: () => setExpenseModalOpen(true),
      closeExpenseModal: () => setExpenseModalOpen(false),
      isQuotationModalOpen,
      quotationModalCustomerId,
      editingQuotationId,
      openQuotationModal: (customerId?: string) => {
        setEditingQuotationId(null);
        setQuotationModalCustomerId(customerId ?? null);
        setQuotationModalOpen(true);
      },
      openEditQuotationModal: (quotationDbId: string) => {
        setEditingQuotationId(quotationDbId);
        setQuotationModalCustomerId(null);
        setQuotationModalOpen(true);
      },
      closeQuotationModal: () => {
        setQuotationModalOpen(false);
        setEditingQuotationId(null);
      },
      isWorkerModalOpen,
      editingWorkerId,
      openWorkerModal: () => {
        setEditingWorkerId(null);
        setWorkerModalOpen(true);
      },
      openEditWorkerModal: (workerId: string) => {
        setEditingWorkerId(workerId);
        setWorkerModalOpen(true);
      },
      closeWorkerModal: () => {
        setWorkerModalOpen(false);
        setEditingWorkerId(null);
      },
      isLinkModalOpen,
      openLinkModal: () => setLinkModalOpen(true),
      closeLinkModal: () => setLinkModalOpen(false),
      isPaymentModalOpen,
      paymentModalQuotationDbId,
      openPaymentModal: (quotationDbId: string) => {
        setPaymentModalQuotationDbId(quotationDbId);
        setPaymentModalOpen(true);
      },
      closePaymentModal: () => setPaymentModalOpen(false),
      printTarget,
      openPrint: (kind, id) => setPrintTarget({ kind, id }),
      closePrint: () => setPrintTarget(null),
      paymentReceipt,
      closePaymentReceipt: () => setPaymentReceipt(null),
      authLoading,
      dataLoading,
      hasLoadedOnce,
      isAuthenticated,
      currentUserName,
      currentUserId: session?.user.id ?? null,
      currentUserRole,
      login,
      logout,
      accessDeniedMessage,
      clearAccessDeniedMessage: () => setAccessDeniedMessage(null),
      employees,
      refreshEmployees,
      setEmployeeActive: guardMobile(setEmployeeActive, isMobileView),
      createEmployee: guardMobile(createEmployee, isMobileView),
      deleteEmployee: guardMobile(deleteEmployee, isMobileView),
      isMobileView,
    }),
    [
      gstEnabled,
      toast,
      showToast,
      dismissToast,
      isMobileView,
      customers,
      vendors,
      expenses,
      vendorPurchases,
      vendorPayments,
      vendorSlips,
      purchaseBills,
      invoices,
      quotations,
      quotationPayments,
      monthlyFigures,
      dashboardSummary,
      workers,
      workerAdvances,
      workerPayments,
      links,
      priceList,
      isCustomerModalOpen,
      editingCustomerId,
      isVendorModalOpen,
      editingVendorId,
      isExpenseModalOpen,
      isQuotationModalOpen,
      quotationModalCustomerId,
      editingQuotationId,
      isWorkerModalOpen,
      editingWorkerId,
      isLinkModalOpen,
      isPaymentModalOpen,
      paymentModalQuotationDbId,
      printTarget,
      paymentReceipt,
      authLoading,
      dataLoading,
      hasLoadedOnce,
      isAuthenticated,
      currentUserName,
      session,
      currentUserRole,
      accessDeniedMessage,
      employees,
      refreshEmployees,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}