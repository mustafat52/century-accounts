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
  ItemSlab,
  Quotation,
  MonthlyFigure,
  Worker,
  ImportantLink,
  DashboardSummary,
} from '../types';
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
} from '../lib/mappers';

export type NewInvoiceItemInput =
  | {
      type: 'simple';
      description: string;
      slab: ItemSlab | null;
      quantity: number;
      rate: number;
    }
  | {
      type: 'glass';
      description: string;
      slab: ItemSlab | null;
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
  dueDate: string | null; // required for 'quick', ignored for 'job'
  transportation: number;
  items: NewInvoiceItemInput[];
}

interface NewCustomerInput {
  name: string;
  contact: string;
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
  vendorId?: string;
  description: string;
  amount: number;
  date: string;
  markUnpaid?: boolean;
}

interface NewQuotationInput {
  customerId: string;
  description: string;
  amount: number;
  validUntil: string;
}

interface EditQuotationInput {
  description: string;
  amount: number;
  validUntil: string;
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

export interface PaymentReceipt {
  paymentAmount: number;
  paymentDate: string;
  note?: string;
  invoice: Invoice;
}

export type PrintTarget = { kind: 'invoice' | 'quotation'; id: string } | null;

interface AppContextValue {
  gstEnabled: boolean;
  toggleGst: () => void;

  customers: Customer[];
  addCustomer: (input: NewCustomerInput) => Promise<Customer | null>;

  vendors: Vendor[];
  addVendor: (input: NewVendorInput) => Promise<Vendor | null>;

  expenses: Expense[];
  addExpense: (input: NewExpenseInput) => Promise<void>;

  monthlyFigures: MonthlyFigure[];
  dashboardSummary: DashboardSummary;

  invoices: Invoice[];
  addInvoice: (input: NewInvoiceInput) => Promise<Invoice | null>;
  markJobCompleted: (invoiceDbId: string) => Promise<void>;
  recordInvoicePayment: (invoiceDbId: string, amount: number, note?: string) => Promise<PaymentReceipt | null>;

  quotations: Quotation[];
  addQuotation: (input: NewQuotationInput) => Promise<Quotation | null>;
  updateQuotation: (quotationDbId: string, input: EditQuotationInput) => Promise<void>;
  convertQuotationToInvoice: (quotationDbId: string) => Promise<void>;

  workers: Worker[];
  addWorker: (input: NewWorkerInput) => Promise<void>;
  logWorkerAdvance: (input: NewWorkerAdvanceInput) => Promise<void>;

  links: ImportantLink[];
  addLink: (input: NewLinkInput) => Promise<void>;

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
  editingQuotationId: string | null; // dbId of the quotation being edited
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

  printTarget: PrintTarget;
  openPrint: (kind: 'invoice' | 'quotation', id: string) => void;
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
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [monthlyFigures, setMonthlyFigures] = useState<MonthlyFigure[]>([]);
  const [dashboardSummary, setDashboardSummary] = useState<DashboardSummary>(EMPTY_SUMMARY);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [links, setLinks] = useState<ImportantLink[]>([]);

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

  const refreshWorkers = useCallback(async () => {
    const { data } = await supabase.from('worker_month_summary').select('*').order('name');
    if (data) setWorkers(data.map(mapWorker));
  }, []);

  const refreshExpenses = useCallback(async () => {
    const { data } = await supabase.from('expenses').select('*').order('created_at', { ascending: false });
    if (data) setExpenses(data.map(mapExpense));
  }, []);

  const refreshDashboardSummary = useCallback(async () => {
    const { data } = await supabase.from('dashboard_summary').select('*').single();
    if (data) setDashboardSummary(mapDashboardSummary(data));
  }, []);

  // Fetches one invoice fully hydrated (computed status/balance + its items).
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
      monthlyRes,
      workersRes,
      linksRes,
      summaryRes,
    ] = await Promise.all([
      supabase.from('business_settings').select('*').single(),
      supabase.from('customer_balances').select('*').order('name'),
      supabase.from('vendor_balances').select('*').order('name'),
      supabase.from('invoices_effective').select('*').order('created_at', { ascending: false }),
      supabase.from('invoice_items').select('*').order('sort_order'),
      supabase.from('quotations').select('*').order('created_at', { ascending: false }),
      supabase.from('expenses').select('*').order('created_at', { ascending: false }),
      supabase.from('monthly_revenue_expense').select('*'),
      supabase.from('worker_month_summary').select('*').order('name'),
      supabase.from('important_links').select('*').order('sort_order'),
      supabase.from('dashboard_summary').select('*').single(),
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
    if (monthlyRes.data) setMonthlyFigures(monthlyRes.data.map(mapMonthlyFigure));
    if (workersRes.data) setWorkers(workersRes.data.map(mapWorker));
    if (linksRes.data) setLinks(linksRes.data.map(mapImportantLink));
    if (summaryRes.data) setDashboardSummary(mapDashboardSummary(summaryRes.data));

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
      .insert({ name: input.name, contact: input.contact, address: input.address || null, gstin: input.gstin || null })
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

  // ---------- Expenses ----------
  const addExpense = async (input: NewExpenseInput) => {
    const { data, error } = await supabase
      .from('expenses')
      .insert({
        category: input.category,
        vendor_id: input.vendorId || null,
        description: input.description,
        amount: input.amount,
        expense_date: input.date,
        is_paid: !input.markUnpaid,
      })
      .select()
      .single();
    if (error || !data) return;
    setExpenses((prev) => [mapExpense(data), ...prev]);
    if (input.vendorId) await refreshVendors();
  };

  // ---------- Invoices ----------
  const addInvoice = async (input: NewInvoiceInput): Promise<Invoice | null> => {
    const { data, error } = await supabase.rpc('create_invoice_with_items', {
      p_customer_id: input.customerId,
      p_kind: input.kind,
      p_due_date: input.kind === 'quick' ? input.dueDate : null,
      p_gst_enabled: gstEnabled,
      p_transportation: input.transportation || 0,
      p_items: input.items.map((i) =>
        i.type === 'glass'
          ? {
              type: 'glass',
              description: i.description,
              slab: i.slab ?? '',
              lengthIn: i.lengthIn,
              widthIn: i.widthIn,
              qty: i.qty,
              ratePerSft: i.ratePerSft,
              polishRate: i.polishRate,
              fixingRatePerSft: i.fixingRatePerSft,
            }
          : { type: 'simple', description: i.description, slab: i.slab ?? '', quantity: i.quantity, rate: i.rate }
      ),
    });
    if (error || !data) return null;
    const full = await fetchInvoiceEffective(data.id);
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
  const addQuotation = async (input: NewQuotationInput): Promise<Quotation | null> => {
    const gst = gstEnabled ? Math.round(input.amount * 0.18) : 0;
    const { data, error } = await supabase
      .from('quotations')
      .insert({ customer_id: input.customerId, description: input.description, amount: input.amount, gst, valid_until: input.validUntil })
      .select()
      .single();
    if (error || !data) return null;
    const newQuotation = mapQuotation(data);
    setQuotations((prev) => [newQuotation, ...prev]);
    return newQuotation;
  };

  const updateQuotation = async (quotationDbId: string, input: EditQuotationInput) => {
    const gst = gstEnabled ? Math.round(input.amount * 0.18) : 0;
    const { data, error } = await supabase
      .from('quotations')
      .update({ description: input.description, amount: input.amount, gst, valid_until: input.validUntil })
      .eq('id', quotationDbId)
      .select()
      .single();
    if (error || !data) return;
    const updated = mapQuotation(data);
    setQuotations((prev) => prev.map((q) => (q.dbId === quotationDbId ? updated : q)));
  };

  const convertQuotationToInvoice = async (quotationDbId: string) => {
    const { data, error } = await supabase.rpc('convert_quotation_to_invoice', { p_quotation_id: quotationDbId });
    if (error || !data) return;
    const full = await fetchInvoiceEffective(data.id);
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
      monthlyFigures,
      dashboardSummary,
      invoices,
      addInvoice,
      markJobCompleted,
      recordInvoicePayment,
      quotations,
      addQuotation,
      updateQuotation,
      convertQuotationToInvoice,
      workers,
      addWorker,
      logWorkerAdvance,
      links,
      addLink,
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
      invoices,
      quotations,
      monthlyFigures,
      dashboardSummary,
      workers,
      links,
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