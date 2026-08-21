import React, { createContext, useContext, useState, useMemo, useEffect, useCallback } from 'react';
import type { Session } from '@supabase/supabase-js';
import type {
  Customer,
  Vendor,
  Expense,
  ExpenseCategory,
  Invoice,
  InvoiceItem,
  InvoiceKind,
  InvoiceSlab,
  Quotation,
  MonthlyFigure,
  Worker,
  ImportantLink,
  DashboardSummary,
  VendorPurchase,
  PriceListItem,
  VendorSlip,
  VendorSlipItem,
  CareOf,
} from '../types';
import { SLAB_DISCOUNT_PERCENT } from '../types';
import { supabase } from '../lib/supabaseClient';
import {
  mapCustomerBalance,
  mapVendorBalance,
  mapInvoice,
  mapInvoiceItem,
  mapQuotation,
  mapExpense,
  mapMonthlyFigure,
  mapWorker,
  mapImportantLink,
  mapDashboardSummary,
  mapVendorPurchase,
  mapPriceListItem,
  mapVendorSlip,
  mapVendorSlipItem,
} from '../lib/mappers';

export type NewInvoiceItemInput =
  | {
      type: 'simple';
      description: string;
      quantity: number;
      rate: number;
    }
  | {
      type: 'glass';
      description: string;
      thicknessMm?: string | null;
      lengthIn: number;
      widthIn: number;
      qty: number;
      ratePerSft: number;
      polishRate: number;
      fixingRatePerSft: number;
    };

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

interface NewInvoiceInput {
  customerId: string;
  kind: InvoiceKind;
  dueDate: string | null;
  transportation: number;
  slab: InvoiceSlab;
  discountPercent: number; // only meaningful when slab === 'D'; otherwise derived from SLAB_DISCOUNT_PERCENT
  items: NewInvoiceItemInput[];
}

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
  items: NewVendorSlipItemInput[];
}

interface NewQuotationInput {
  customerId: string;
  validUntil: string;
  slab: InvoiceSlab;
  discountPercent: number; // only meaningful when slab === 'D'; otherwise derived from SLAB_DISCOUNT_PERCENT
  items: NewQuotationItemInput[];
}

interface EditQuotationInput {
  validUntil: string;
  slab: InvoiceSlab;
  discountPercent: number;
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
  note?: string;
  invoice: Invoice;
}

export type PrintTarget = { kind: 'invoice' | 'quotation' | 'slip'; id: string } | null;

interface AppContextValue {
  gstEnabled: boolean;
  toggleGst: () => void;

  customers: Customer[];
  addCustomer: (input: NewCustomerInput) => Promise<Customer | null>;

  vendors: Vendor[];
  addVendor: (input: NewVendorInput) => Promise<Vendor | null>;

  expenses: Expense[];
  addExpense: (input: NewExpenseInput) => Promise<void>;

  vendorPurchases: VendorPurchase[];
  addVendorPurchase: (input: NewVendorPurchaseInput) => Promise<void>;
  recordVendorPayment: (vendorId: string, amount: number, note?: string) => Promise<void>;

  vendorSlips: VendorSlip[];
  addVendorSlip: (input: NewVendorSlipInput) => Promise<VendorSlip | null>;
  priceVendorSlip: (slipId: string, itemRates: { itemId: string; rate: number }[]) => Promise<void>;

  monthlyFigures: MonthlyFigure[];
  dashboardSummary: DashboardSummary;

  invoices: Invoice[];
  addInvoice: (input: NewInvoiceInput) => Promise<Invoice | null>;
  markJobCompleted: (invoiceDbId: string) => Promise<void>;
  recordInvoicePayment: (invoiceDbId: string, amount: number, note?: string) => Promise<PaymentReceipt | null>;

  quotations: Quotation[];
  addQuotation: (input: NewQuotationInput) => Promise<Quotation | null>;
  updateQuotation: (quotationDbId: string, input: EditQuotationInput) => Promise<void>;
  fetchQuotationItems: (quotationDbId: string) => Promise<NewQuotationItemInput[]>;
  convertQuotationToInvoice: (quotationDbId: string, slab: InvoiceSlab, discountPercent: number) => Promise<void>;

  workers: Worker[];
  addWorker: (input: NewWorkerInput) => Promise<void>;
  logWorkerAdvance: (input: NewWorkerAdvanceInput) => Promise<void>;

  links: ImportantLink[];
  addLink: (input: NewLinkInput) => Promise<void>;

  priceList: PriceListItem[];
  addPriceListItem: (input: NewPriceListItemInput) => Promise<void>;
  updatePriceListItem: (id: string, input: NewPriceListItemInput) => Promise<void>;
  deletePriceListItem: (id: string) => Promise<void>;

  isInvoiceModalOpen: boolean;
  invoiceModalCustomerId: string | null;
  openInvoiceModal: (customerId?: string) => void;
  closeInvoiceModal: () => void;

  isCustomerModalOpen: boolean;
  openCustomerModal: () => void;
  closeCustomerModal: () => void;

  isVendorModalOpen: boolean;
  openVendorModal: () => void;
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
  openWorkerModal: () => void;
  closeWorkerModal: () => void;

  isAdvanceModalOpen: boolean;
  advanceModalWorkerId: string | null;
  openAdvanceModal: (workerId?: string) => void;
  closeAdvanceModal: () => void;

  isLinkModalOpen: boolean;
  openLinkModal: () => void;
  closeLinkModal: () => void;

  isPaymentModalOpen: boolean;
  paymentModalInvoiceDbId: string | null;
  openPaymentModal: (invoiceDbId: string) => void;
  closePaymentModal: () => void;

  isConvertQuotationModalOpen: boolean;
  convertQuotationModalId: string | null;
  openConvertQuotationModal: (quotationDbId: string) => void;
  closeConvertQuotationModal: () => void;

  printTarget: PrintTarget;
  openPrint: (kind: 'invoice' | 'quotation' | 'slip', id: string) => void;
  closePrint: () => void;

  paymentReceipt: PaymentReceipt | null;
  closePaymentReceipt: () => void;

  authLoading: boolean;
  dataLoading: boolean;
  isAuthenticated: boolean;
  currentUserName: string | null;
  login: (email: string, password: string) => Promise<string | null>;
  logout: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

const EMPTY_SUMMARY: DashboardSummary = { customersBilledThisMonth: 0, jobsInProgress: 0, jobsCompletedThisMonth: 0 };

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [gstEnabled, setGstEnabled] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [vendorPurchases, setVendorPurchases] = useState<VendorPurchase[]>([]);
  const [vendorSlips, setVendorSlips] = useState<VendorSlip[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [monthlyFigures, setMonthlyFigures] = useState<MonthlyFigure[]>([]);
  const [dashboardSummary, setDashboardSummary] = useState<DashboardSummary>(EMPTY_SUMMARY);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [links, setLinks] = useState<ImportantLink[]>([]);
  const [priceList, setPriceList] = useState<PriceListItem[]>([]);

  const [isInvoiceModalOpen, setInvoiceModalOpen] = useState(false);
  const [invoiceModalCustomerId, setInvoiceModalCustomerId] = useState<string | null>(null);
  const [isCustomerModalOpen, setCustomerModalOpen] = useState(false);
  const [isVendorModalOpen, setVendorModalOpen] = useState(false);
  const [isExpenseModalOpen, setExpenseModalOpen] = useState(false);
  const [isQuotationModalOpen, setQuotationModalOpen] = useState(false);
  const [quotationModalCustomerId, setQuotationModalCustomerId] = useState<string | null>(null);
  const [editingQuotationId, setEditingQuotationId] = useState<string | null>(null);
  const [isWorkerModalOpen, setWorkerModalOpen] = useState(false);
  const [isAdvanceModalOpen, setAdvanceModalOpen] = useState(false);
  const [advanceModalWorkerId, setAdvanceModalWorkerId] = useState<string | null>(null);
  const [isLinkModalOpen, setLinkModalOpen] = useState(false);
  const [isPaymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentModalInvoiceDbId, setPaymentModalInvoiceDbId] = useState<string | null>(null);
  const [isConvertQuotationModalOpen, setConvertQuotationModalOpen] = useState(false);
  const [convertQuotationModalId, setConvertQuotationModalId] = useState<string | null>(null);
  const [printTarget, setPrintTarget] = useState<PrintTarget>(null);
  const [paymentReceipt, setPaymentReceipt] = useState<PaymentReceipt | null>(null);

  const [session, setSession] = useState<Session | null>(null);
  const [currentUserName, setCurrentUserName] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);

  const isAuthenticated = Boolean(session);

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

  const fetchInvoiceEffective = useCallback(async (dbId: string): Promise<Invoice | null> => {
    const [invRes, itemsRes] = await Promise.all([
      supabase.from('invoices_effective').select('*').eq('id', dbId).single(),
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
      expensesRes,
      vendorPurchasesRes,
      monthlyRes,
      workersRes,
      linksRes,
      summaryRes,
      priceListRes,
      vendorSlipsRes,
      vendorSlipItemsRes,
    ] = await Promise.all([
      supabase.from('business_settings').select('*').single(),
      supabase.from('customer_balances').select('*').order('name'),
      supabase.from('vendor_balances').select('*').order('name'),
      supabase.from('invoices_effective').select('*').order('created_at', { ascending: false }),
      supabase.from('invoice_items').select('*').order('sort_order'),
      supabase.from('quotations').select('*').order('created_at', { ascending: false }),
      supabase.from('expenses').select('*').is('vendor_id', null).order('created_at', { ascending: false }),
      supabase.from('vendor_purchases_effective').select('*').order('expense_date', { ascending: false }),
      supabase.from('monthly_revenue_expense').select('*'),
      supabase.from('worker_month_summary').select('*').order('name'),
      supabase.from('important_links').select('*').order('sort_order'),
      supabase.from('dashboard_summary').select('*').single(),
      supabase.from('price_list').select('*').order('sort_order'),
      supabase.from('vendor_slips').select('*').order('created_at', { ascending: false }),
      supabase.from('vendor_slip_items').select('*').order('sort_order'),
    ]);

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
    if (expensesRes.data) setExpenses(expensesRes.data.map(mapExpense));
    if (vendorPurchasesRes.data) setVendorPurchases(vendorPurchasesRes.data.map(mapVendorPurchase));
    if (monthlyRes.data) setMonthlyFigures(monthlyRes.data.map(mapMonthlyFigure));
    if (workersRes.data) setWorkers(workersRes.data.map(mapWorker));
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

    setDataLoading(false);
  }, []);

  // ---------- Auth bootstrap ----------
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setCurrentUserName(null);
      return;
    }
    supabase
      .from('profiles')
      .select('display_name')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => setCurrentUserName(data?.display_name ?? session.user.email ?? null));
    loadAllData();
  }, [session, loadAllData]);

  // ---------- Auth actions ----------
  const login = async (email: string, password: string): Promise<string | null> => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.session) return null;
    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', data.session.user.id)
      .single();
    return profile?.display_name ?? data.session.user.email ?? null;
  };

  const logout = async () => {
    await supabase.auth.signOut();
  };

  // ---------- Settings ----------
  const toggleGst = async () => {
    const next = !gstEnabled;
    setGstEnabled(next);
    const { error } = await supabase.from('business_settings').update({ gst_enabled: next }).eq('id', true);
    if (error) setGstEnabled(!next);
  };

  // ---------- Customers / Vendors ----------
  const addCustomer = async (input: NewCustomerInput): Promise<Customer | null> => {
    const { data, error } = await supabase
      .from('customers')
      .insert({ name: input.name, contact: input.contact || null, address: input.address || null, gstin: input.gstin || null })
      .select()
      .single();
    if (error || !data) return null;
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
    if (error || !data) return null;
    const newVendor: Vendor = { id: data.id, name: data.name, category: data.category, contact: data.contact, totalPurchased: 0, payable: 0 };
    setVendors((prev) => [newVendor, ...prev]);
    return newVendor;
  };

  // ---------- Expenses (non-vendor only) ----------
  const addExpense = async (input: NewExpenseInput) => {
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
    if (error || !data) return;
    setExpenses((prev) => [mapExpense(data), ...prev]);
  };

  // ---------- Vendor purchases ----------
  const addVendorPurchase = async (input: NewVendorPurchaseInput) => {
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
    if (error || !data) return;
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
  };

  // Pays down a vendor's total payable in one shot — the RPC allocates the
  // amount across that vendor's outstanding purchases oldest-first, so
  // individual purchase/slip statuses still update correctly underneath.
  const recordVendorPayment = async (vendorId: string, amount: number, note?: string) => {
    const { error } = await supabase.rpc('record_vendor_payment', {
      p_vendor_id: vendorId,
      p_amount: amount,
      p_note: note || null,
    });
    if (error) return;
    await Promise.all([refreshVendorPurchases(), refreshVendors()]);
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
      .insert({ vendor_id: input.vendorId, care_of: input.careOf })
      .select()
      .single();
    if (slipErr || !slipRow) return null;

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
  const priceVendorSlip = async (slipId: string, itemRates: { itemId: string; rate: number }[]) => {
    const { error } = await supabase.rpc('price_vendor_slip', {
      p_slip_id: slipId,
      p_items: itemRates.map((r) => ({ id: r.itemId, rate: r.rate })),
    });
    if (error) return;
    await Promise.all([refreshVendorSlips(), refreshVendorPurchases(), refreshVendors()]);
  };

  // Glass is billed in 6-inch increments — any entered length/width rounds
  // UP to the next multiple of 6, never to the nearest one (46in bills as
  // 48in, not 45in). This is the billed dimension, so it's what gets
  // stored on the item row too, not the raw typed value.
  const roundUpTo6 = (n: number) => (n > 0 ? Math.ceil(n / 6) * 6 : 0);

  // ---------- Invoices ----------
  const addInvoice = async (input: NewInvoiceInput): Promise<Invoice | null> => {
    const computed = input.items.map((i) => {
      if (i.type === 'glass') {
        const lengthIn = roundUpTo6(i.lengthIn);
        const widthIn = roundUpTo6(i.widthIn);
        const sft = Math.round(((lengthIn * widthIn) / 144) * i.qty * 100) / 100;
        const workGlass = Math.round(sft * i.ratePerSft * 100) / 100;
        const rft = Math.round(((2 * (lengthIn + widthIn)) / 12) * i.qty * 100) / 100;
        const polishAmt = Math.round(rft * (i.polishRate || 0) * 100) / 100;
        const fixingAmt = Math.round(sft * (i.fixingRatePerSft || 0) * 100) / 100;
        const amount = workGlass + polishAmt + fixingAmt;
        return { ...i, lengthIn, widthIn, sft, workGlass, rft, polishAmt, fixingAmt, amount };
      }
      const amount = Math.round(i.quantity * i.rate * 100) / 100;
      return { ...i, amount };
    });

    const subtotal = computed.reduce((sum, i) => sum + i.amount, 0);
    if (subtotal <= 0) return null;

    // Discount is calculated on the subtotal, before tax. A/B/C are fixed
    // tiers; D is a custom percent typed in per-invoice. One slab per bill.
    const discountPercent = input.slab === 'D' ? input.discountPercent || 0 : SLAB_DISCOUNT_PERCENT[input.slab];
    const discountAmount = Math.round(subtotal * (discountPercent / 100) * 100) / 100;
    const taxableValue = subtotal - discountAmount;
    const gst = gstEnabled ? Math.round(taxableValue * 0.18 * 100) / 100 : 0;
    const summary = computed.slice(0, 3).map((i) => i.description).join(', ') || 'Invoice';

    const { data: invoiceRow, error: invoiceErr } = await supabase
      .from('invoices')
      .insert({
        customer_id: input.customerId,
        kind: input.kind,
        description: summary,
        amount: subtotal,
        slab: input.slab,
        discount_percent: discountPercent,
        discount_amount: discountAmount,
        gst,
        transportation: input.transportation || 0,
        due_date: input.kind === 'quick' ? input.dueDate : null,
        work_status: input.kind === 'job' ? 'in_progress' : null,
      })
      .select()
      .single();

    if (invoiceErr || !invoiceRow) return null;

    const itemRows = computed.map((i, idx) =>
      i.type === 'glass'
        ? {
            invoice_id: invoiceRow.id,
            item_type: 'glass',
            description: i.description,
            thickness_mm: i.thicknessMm || null,
            sort_order: idx,
            length_in: i.lengthIn,
            width_in: i.widthIn,
            glass_qty: i.qty,
            rate_per_sft: i.ratePerSft,
            sft: i.sft,
            work_glass_amount: i.workGlass,
            rft: i.rft,
            polish_rate: i.polishRate || 0,
            polish_amount: i.polishAmt,
            fixing_rate_per_sft: i.fixingRatePerSft || 0,
            fixing_amount: i.fixingAmt,
            amount: i.amount,
          }
        : {
            invoice_id: invoiceRow.id,
            item_type: 'simple',
            description: i.description,
            sort_order: idx,
            quantity: i.quantity,
            rate: i.rate,
            amount: i.amount,
          }
    );

    const { error: itemsErr } = await supabase.from('invoice_items').insert(itemRows);

    if (itemsErr) {
      await supabase.from('invoices').delete().eq('id', invoiceRow.id);
      return null;
    }

    const full = await fetchInvoiceEffective(invoiceRow.id);
    if (!full) return null;
    setInvoices((prev) => [full, ...prev]);
    await Promise.all([refreshCustomers(), refreshDashboardSummary()]);
    return full;
  };

  const markJobCompleted = async (invoiceDbId: string) => {
    const { data, error } = await supabase.rpc('mark_job_completed', { p_invoice_id: invoiceDbId });
    if (error || !data) return;
    const full = await fetchInvoiceEffective(data.id);
    if (!full) return;
    setInvoices((prev) => prev.map((i) => (i.dbId === invoiceDbId ? full : i)));
    await Promise.all([refreshCustomers(), refreshDashboardSummary()]);
  };

  const recordInvoicePayment = async (
    invoiceDbId: string,
    amount: number,
    note?: string
  ): Promise<PaymentReceipt | null> => {
    const { data, error } = await supabase.rpc('record_invoice_payment', {
      p_invoice_id: invoiceDbId,
      p_amount: amount,
      p_note: note ?? '',
    });
    if (error || !data) return null;
    const full = await fetchInvoiceEffective(invoiceDbId);
    if (!full) return null;
    setInvoices((prev) => prev.map((i) => (i.dbId === invoiceDbId ? full : i)));
    await refreshCustomers();
    const receipt: PaymentReceipt = {
      paymentAmount: Number(data.amount),
      paymentDate: data.payment_date,
      note: data.note ?? undefined,
      invoice: full,
    };
    setPaymentReceipt(receipt);
    return receipt;
  };

  // ---------- Quotations ----------
  // Reuses the same roundUpTo6 defined above (invoices section) — must
  // match the client-side preview exactly, or the modal's live total would
  // disagree with what actually gets saved.
  function computeQuotationItemAmount(i: NewQuotationItemInput) {
    if (i.type === 'glass') {
      const len = roundUpTo6(i.lengthIn);
      const wid = roundUpTo6(i.widthIn);
      const sft = Math.round(((len * wid) / 144) * i.qty * 100) / 100;
      const workGlass = Math.round(sft * i.ratePerSft * 100) / 100;
      const rft = Math.round(((2 * (len + wid)) / 12) * i.qty * 100) / 100;
      const polishAmt = Math.round(rft * (i.polishRate || 0) * 100) / 100;
      const fixingAmt = Math.round(sft * (i.fixingRatePerSft || 0) * 100) / 100;
      return { sft, workGlass, rft, polishAmt, fixingAmt, amount: workGlass + polishAmt + fixingAmt };
    }
    return { amount: Math.round(i.quantity * i.rate * 100) / 100 };
  }

  function buildQuotationItemRows(quotationId: string, items: NewQuotationItemInput[]) {
    return items.map((i, idx) => {
      const c = computeQuotationItemAmount(i);
      if (i.type === 'glass') {
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
      return {
        quotation_id: quotationId,
        item_type: 'simple',
        description: i.description,
        area: i.area || null,
        sort_order: idx,
        quantity: i.quantity,
        rate: i.rate,
        amount: c.amount,
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

  const addQuotation = async (input: NewQuotationInput): Promise<Quotation | null> => {
    const subtotal = input.items.reduce((sum, i) => sum + computeQuotationItemAmount(i).amount, 0);
    if (subtotal <= 0) return null;
    const discountPercent = input.slab === 'D' ? input.discountPercent || 0 : SLAB_DISCOUNT_PERCENT[input.slab];
    const discountAmount = Math.round(subtotal * (discountPercent / 100) * 100) / 100;
    const taxableValue = subtotal - discountAmount;
    const gst = gstEnabled ? Math.round(taxableValue * 0.18 * 100) / 100 : 0;
    const summary = input.items.slice(0, 3).map((i) => i.description).join(', ') || 'Quotation';

    const { data: qRow, error: qErr } = await supabase
      .from('quotations')
      .insert({
        customer_id: input.customerId,
        description: summary,
        amount: subtotal,
        slab: input.slab,
        discount_percent: discountPercent,
        discount_amount: discountAmount,
        gst,
        valid_until: input.validUntil,
      })
      .select()
      .single();
    if (qErr || !qRow) return null;

    const itemRows = buildQuotationItemRows(qRow.id, input.items);
    const { error: itemsErr } = await supabase.from('quotation_items').insert(itemRows);
    if (itemsErr) {
      await supabase.from('quotations').delete().eq('id', qRow.id);
      return null;
    }

    const newQuotation = mapQuotation(qRow);
    setQuotations((prev) => [newQuotation, ...prev]);
    return newQuotation;
  };

  const updateQuotation = async (quotationDbId: string, input: EditQuotationInput) => {
    const subtotal = input.items.reduce((sum, i) => sum + computeQuotationItemAmount(i).amount, 0);
    if (subtotal <= 0) return;
    const discountPercent = input.slab === 'D' ? input.discountPercent || 0 : SLAB_DISCOUNT_PERCENT[input.slab];
    const discountAmount = Math.round(subtotal * (discountPercent / 100) * 100) / 100;
    const taxableValue = subtotal - discountAmount;
    const gst = gstEnabled ? Math.round(taxableValue * 0.18 * 100) / 100 : 0;
    const summary = input.items.slice(0, 3).map((i) => i.description).join(', ') || 'Quotation';

    const { data: qRow, error: qErr } = await supabase
      .from('quotations')
      .update({
        description: summary,
        amount: subtotal,
        slab: input.slab,
        discount_percent: discountPercent,
        discount_amount: discountAmount,
        gst,
        valid_until: input.validUntil,
      })
      .eq('id', quotationDbId)
      .select()
      .single();
    if (qErr || !qRow) return;

    await supabase.from('quotation_items').delete().eq('quotation_id', quotationDbId);
    const itemRows = buildQuotationItemRows(quotationDbId, input.items);
    await supabase.from('quotation_items').insert(itemRows);

    const updated = mapQuotation(qRow);
    setQuotations((prev) => prev.map((q) => (q.dbId === quotationDbId ? updated : q)));
  };

  // slab/discountPercent here are whatever was last chosen in
  // ConvertQuotationModal — defaulted to the quotation's own saved slab,
  // but editable right at the point of conversion in case the price
  // negotiated with the customer ended up different from what's saved.
  // GST is recomputed fresh from the quotation's subtotal using THIS
  // slab/discount, not copied from the quotation's stored gst.
  const convertQuotationToInvoice = async (quotationDbId: string, slab: InvoiceSlab, discountPercent: number) => {
    const { data: qRow, error: qErr } = await supabase.from('quotations').select('*').eq('id', quotationDbId).eq('status', 'pending').single();
    if (qErr || !qRow) return;

    const { data: qItems, error: itemsErr } = await supabase.from('quotation_items').select('*').eq('quotation_id', quotationDbId).order('sort_order');
    if (itemsErr) return;

    const subtotal = Number(qRow.amount);
    const resolvedDiscountPercent = slab === 'D' ? discountPercent || 0 : SLAB_DISCOUNT_PERCENT[slab];
    const discountAmount = Math.round(subtotal * (resolvedDiscountPercent / 100) * 100) / 100;
    const taxableValue = subtotal - discountAmount;
    const gst = gstEnabled ? Math.round(taxableValue * 0.18 * 100) / 100 : 0;

    const { data: invRow, error: invErr } = await supabase
      .from('invoices')
      .insert({
        customer_id: qRow.customer_id,
        kind: 'job',
        description: qRow.description,
        amount: subtotal,
        slab,
        discount_percent: resolvedDiscountPercent,
        discount_amount: discountAmount,
        gst,
        work_status: 'in_progress',
      })
      .select()
      .single();
    if (invErr || !invRow) return;

    const invoiceItemRows = (qItems ?? []).map((it: any) =>
      it.item_type === 'glass'
        ? {
            invoice_id: invRow.id,
            item_type: 'glass',
            description: it.description,
            sort_order: it.sort_order,
            thickness_mm: it.thickness_mm,
            length_in: it.length_in,
            width_in: it.width_in,
            glass_qty: it.glass_qty,
            rate_per_sft: it.rate_per_sft,
            sft: it.sft,
            work_glass_amount: it.work_glass_amount,
            rft: it.rft,
            polish_rate: it.polish_rate,
            polish_amount: it.polish_amount,
            fixing_rate_per_sft: it.fixing_rate_per_sft,
            fixing_amount: it.fixing_amount,
            amount: it.amount,
          }
        : {
            invoice_id: invRow.id,
            item_type: 'simple',
            description: it.description,
            sort_order: it.sort_order,
            quantity: it.quantity,
            rate: it.rate,
            amount: it.amount,
          }
    );

    if (invoiceItemRows.length > 0) {
      await supabase.from('invoice_items').insert(invoiceItemRows);
    }

    await supabase.from('quotations').update({ status: 'converted', converted_invoice_id: invRow.id }).eq('id', quotationDbId);

    const full = await fetchInvoiceEffective(invRow.id);
    if (full) setInvoices((prev) => [full, ...prev]);
    setQuotations((prev) => prev.map((q) => (q.dbId === quotationDbId ? { ...q, status: 'converted' } : q)));
    await Promise.all([refreshCustomers(), refreshDashboardSummary()]);
  };

  // ---------- Workers / Payslips ----------
  const addWorker = async (input: NewWorkerInput) => {
    const { data, error } = await supabase
      .from('workers')
      .insert({ name: input.name, monthly_salary: input.monthlySalary })
      .select()
      .single();
    if (error || !data) return;
    const newWorker: Worker = {
      id: data.id,
      name: data.name,
      monthlySalary: Number(data.monthly_salary),
      advancesThisMonth: 0,
      remainingThisMonth: Number(data.monthly_salary),
    };
    setWorkers((prev) => [...prev, newWorker].sort((a, b) => a.name.localeCompare(b.name)));
  };

  const logWorkerAdvance = async (input: NewWorkerAdvanceInput) => {
    const { error } = await supabase.rpc('log_worker_advance', {
      p_worker_id: input.workerId,
      p_amount: input.amount,
      p_date: input.date,
      p_note: input.note ?? '',
    });
    if (error) return;
    await Promise.all([refreshWorkers(), refreshExpenses()]);
  };

  // ---------- Important Links ----------
  const addLink = async (input: NewLinkInput) => {
    const { data, error } = await supabase
      .from('important_links')
      .insert({ label: input.label, url: input.url, category: input.category || null, sort_order: links.length })
      .select()
      .single();
    if (error || !data) return;
    setLinks((prev) => [...prev, mapImportantLink(data)]);
  };

  // ---------- Price List ----------
  const addPriceListItem = async (input: NewPriceListItemInput) => {
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
    if (error || !data) return;
    setPriceList((prev) => [...prev, mapPriceListItem(data)]);
  };

  const updatePriceListItem = async (id: string, input: NewPriceListItemInput) => {
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
    if (error || !data) return;
    setPriceList((prev) => prev.map((p) => (p.id === id ? mapPriceListItem(data) : p)));
  };

  const deletePriceListItem = async (id: string) => {
    const { error } = await supabase.from('price_list').delete().eq('id', id);
    if (error) return;
    setPriceList((prev) => prev.filter((p) => p.id !== id));
  };

  const value = useMemo<AppContextValue>(
    () => ({
      gstEnabled,
      toggleGst,
      customers,
      addCustomer,
      vendors,
      addVendor,
      expenses,
      addExpense,
      vendorPurchases,
      addVendorPurchase,
      recordVendorPayment,
      vendorSlips,
      addVendorSlip,
      priceVendorSlip,
      monthlyFigures,
      dashboardSummary,
      invoices,
      addInvoice,
      markJobCompleted,
      recordInvoicePayment,
      quotations,
      addQuotation,
      updateQuotation,
      fetchQuotationItems,
      convertQuotationToInvoice,
      workers,
      addWorker,
      logWorkerAdvance,
      links,
      addLink,
      priceList,
      addPriceListItem,
      updatePriceListItem,
      deletePriceListItem,
      isInvoiceModalOpen,
      invoiceModalCustomerId,
      openInvoiceModal: (customerId?: string) => {
        setInvoiceModalCustomerId(customerId ?? null);
        setInvoiceModalOpen(true);
      },
      closeInvoiceModal: () => setInvoiceModalOpen(false),
      isCustomerModalOpen,
      openCustomerModal: () => setCustomerModalOpen(true),
      closeCustomerModal: () => setCustomerModalOpen(false),
      isVendorModalOpen,
      openVendorModal: () => setVendorModalOpen(true),
      closeVendorModal: () => setVendorModalOpen(false),
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
      openWorkerModal: () => setWorkerModalOpen(true),
      closeWorkerModal: () => setWorkerModalOpen(false),
      isAdvanceModalOpen,
      advanceModalWorkerId,
      openAdvanceModal: (workerId?: string) => {
        setAdvanceModalWorkerId(workerId ?? null);
        setAdvanceModalOpen(true);
      },
      closeAdvanceModal: () => setAdvanceModalOpen(false),
      isLinkModalOpen,
      openLinkModal: () => setLinkModalOpen(true),
      closeLinkModal: () => setLinkModalOpen(false),
      isPaymentModalOpen,
      paymentModalInvoiceDbId,
      openPaymentModal: (invoiceDbId: string) => {
        setPaymentModalInvoiceDbId(invoiceDbId);
        setPaymentModalOpen(true);
      },
      closePaymentModal: () => setPaymentModalOpen(false),
      isConvertQuotationModalOpen,
      convertQuotationModalId,
      openConvertQuotationModal: (quotationDbId: string) => {
        setConvertQuotationModalId(quotationDbId);
        setConvertQuotationModalOpen(true);
      },
      closeConvertQuotationModal: () => setConvertQuotationModalOpen(false),
      printTarget,
      openPrint: (kind, id) => setPrintTarget({ kind, id }),
      closePrint: () => setPrintTarget(null),
      paymentReceipt,
      closePaymentReceipt: () => setPaymentReceipt(null),
      authLoading,
      dataLoading,
      isAuthenticated,
      currentUserName,
      login,
      logout,
    }),
    [
      gstEnabled,
      customers,
      vendors,
      expenses,
      vendorPurchases,
      vendorSlips,
      invoices,
      quotations,
      monthlyFigures,
      dashboardSummary,
      workers,
      links,
      priceList,
      isInvoiceModalOpen,
      invoiceModalCustomerId,
      isCustomerModalOpen,
      isVendorModalOpen,
      isExpenseModalOpen,
      isQuotationModalOpen,
      quotationModalCustomerId,
      editingQuotationId,
      isWorkerModalOpen,
      isAdvanceModalOpen,
      advanceModalWorkerId,
      isLinkModalOpen,
      isPaymentModalOpen,
      paymentModalInvoiceDbId,
      isConvertQuotationModalOpen,
      convertQuotationModalId,
      printTarget,
      paymentReceipt,
      authLoading,
      dataLoading,
      isAuthenticated,
      currentUserName,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}