import { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import Topbar from '../components/Topbar';
import { useApp } from '../context/AppContext';
import { formatINR } from '../utils/format';
import type { InvoiceSlab } from '../types';
import { SLAB_DISCOUNT_PERCENT } from '../types';

type PeriodKey = 'month' | '3m' | '6m' | 'year';

const PERIODS: Array<{ key: PeriodKey; label: string; monthsBack: number; chartSlice: number }> = [
  { key: 'month', label: 'This Month', monthsBack: 0, chartSlice: 1 },
  { key: '3m', label: 'Last 3 Months', monthsBack: 2, chartSlice: 3 },
  { key: '6m', label: 'Last 6 Months', monthsBack: 5, chartSlice: 6 },
  { key: 'year', label: 'This Year', monthsBack: 12, chartSlice: 6 },
];

function latestDate(dates: string[]): string {
  return dates.length ? dates.reduce((a, b) => (a > b ? a : b)) : new Date().toISOString().slice(0, 10);
}

function periodStart(anchor: string, period: PeriodKey): string {
  const [y, m] = anchor.split('-').map(Number);
  if (period === 'year') return `${y}-01-01`;
  const cfg = PERIODS.find((p) => p.key === period)!;
  const d = new Date(y, m - 1 - cfg.monthsBack, 1);
  return d.toISOString().slice(0, 10);
}

export default function Reports() {
  const { monthlyFigures, customers, vendors, invoices, expenses, quotations } = useApp();
  const [period, setPeriod] = useState<PeriodKey>('6m');

  const anchor = useMemo(
    () => latestDate([...invoices.map((i) => i.date), ...expenses.map((e) => e.date), ...quotations.map((q) => q.date)]),
    [invoices, expenses, quotations]
  );

  const start = useMemo(() => periodStart(anchor, period), [anchor, period]);
  const periodLabel = PERIODS.find((p) => p.key === period)!.label;

  const chartData = useMemo(() => {
    const n = PERIODS.find((p) => p.key === period)!.chartSlice;
    return monthlyFigures.slice(-n);
  }, [monthlyFigures, period]);

  const totals = useMemo(() => {
    const revenue = chartData.reduce((sum, m) => sum + m.revenue, 0);
    const exp = chartData.reduce((sum, m) => sum + m.expenses, 0);
    return { revenue, expenses: exp, profit: revenue - exp };
  }, [chartData]);

  const periodExpenses = useMemo(() => expenses.filter((e) => e.date >= start), [expenses, start]);
  const periodQuotations = useMemo(() => quotations.filter((q) => q.date >= start), [quotations, start]);

  // Quotations are the live source of "business generated this period" now
  // — a quotation exists (and is worth counting) the moment it's created,
  // long before it's ever settled into an invoice.
  const quotationStatusBreakdown = useMemo(() => {
    const buckets: Record<string, { count: number; amount: number }> = {
      due: { count: 0, amount: 0 },
      overdue: { count: 0, amount: 0 },
      paid: { count: 0, amount: 0 },
      converted: { count: 0, amount: 0 },
      expired: { count: 0, amount: 0 },
    };
    periodQuotations.forEach((q) => {
      buckets[q.effectiveStatus].count += 1;
      buckets[q.effectiveStatus].amount += q.grandTotal;
    });
    return buckets;
  }, [periodQuotations]);

  const topCustomers = useMemo(() => {
    const map = new Map<string, number>();
    periodQuotations.forEach((q) => map.set(q.customerId, (map.get(q.customerId) ?? 0) + q.grandTotal));
    return Array.from(map.entries())
      .map(([id, amount]) => ({ name: customers.find((c) => c.id === id)?.name ?? '—', amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);
  }, [periodQuotations, customers]);

  const expenseByCategory = useMemo(() => {
    const map = new Map<string, number>();
    periodExpenses.forEach((e) => map.set(e.category, (map.get(e.category) ?? 0) + e.amount));
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [periodExpenses]);
  const expenseTotal = periodExpenses.reduce((sum, e) => sum + e.amount, 0);

  const topVendors = useMemo(() => {
    const map = new Map<string, number>();
    periodExpenses.forEach((e) => {
      if (!e.vendorId) return;
      map.set(e.vendorId, (map.get(e.vendorId) ?? 0) + e.amount);
    });
    return Array.from(map.entries())
      .map(([id, amount]) => ({ name: vendors.find((v) => v.id === id)?.name ?? '—', amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);
  }, [periodExpenses, vendors]);

  const quotationSummary = useMemo(() => {
    const pending = periodQuotations.filter((q) => q.status === 'pending');
    const converted = periodQuotations.filter((q) => q.status === 'converted');
    // Net out each quotation's own discount, same as invoice totals do
    // above — otherwise this overstates both the quoted and won totals now
    // that quotations carry a real slab/discount.
    return {
      pendingCount: pending.length,
      pendingAmount: pending.reduce((sum, q) => sum + q.amount - q.discountAmount + q.gst + q.transportation, 0),
      convertedCount: converted.length,
      convertedAmount: converted.reduce((sum, q) => sum + q.amount - q.discountAmount + q.gst + q.transportation, 0),
    };
  }, [periodQuotations]);

  const slabBreakdown = useMemo(() => {
    const buckets: Record<InvoiceSlab, { count: number; customers: Set<string>; amount: number }> = {
      A: { count: 0, customers: new Set(), amount: 0 },
      B: { count: 0, customers: new Set(), amount: 0 },
      C: { count: 0, customers: new Set(), amount: 0 },
      D: { count: 0, customers: new Set(), amount: 0 },
    };
    periodQuotations.forEach((q) => {
      const b = buckets[q.slab];
      b.count += 1;
      b.customers.add(q.customerId);
      b.amount += q.grandTotal;
    });
    return (['A', 'B', 'C', 'D'] as InvoiceSlab[]).map((slab) => ({
      slab,
      percentLabel: slab === 'A' ? 'custom %' : `${SLAB_DISCOUNT_PERCENT[slab]}%`,
      invoiceCount: buckets[slab].count,
      customerCount: buckets[slab].customers.size,
      amount: buckets[slab].amount,
    }));
  }, [periodQuotations]);

  const gstSplit = useMemo(() => {
    const withGst = { count: 0, amount: 0 };
    const withoutGst = { count: 0, amount: 0 };
    periodQuotations.forEach((q) => {
      const bucket = q.gst > 0 ? withGst : withoutGst;
      bucket.count += 1;
      bucket.amount += q.grandTotal;
    });
    return { withGst, withoutGst };
  }, [periodQuotations]);

  const totalReceivable = customers.reduce((sum, c) => sum + c.outstanding, 0);
  const totalPayable = vendors.reduce((sum, v) => sum + v.payable, 0);

  return (
    <>
      <Topbar title="Reports" subtitle="Your complete statistics hub — filter by period to drill in" />
      <div className="view-body">
        <div className="chip-row">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              className={`chip${period === p.key ? ' is-active' : ''}`}
              onClick={() => setPeriod(p.key)}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="stat-grid">
          <div className="facet-card">
            <div className="stat-label">Revenue ({periodLabel})</div>
            <div className="stat-value num">{formatINR(totals.revenue)}</div>
          </div>
          <div className="facet-card">
            <div className="stat-label">Expenses ({periodLabel})</div>
            <div className="stat-value num">{formatINR(totals.expenses)}</div>
          </div>
          <div className="facet-card">
            <div className="stat-label">Net profit ({periodLabel})</div>
            <div className="stat-value num" style={{ color: totals.profit >= 0 ? 'var(--success)' : 'var(--danger)' }}>
              {formatINR(totals.profit)}
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h3>Revenue vs expenses — {periodLabel.toLowerCase()}</h3>
            <button className="btn btn-ghost btn-small">Export PDF</button>
          </div>
          <div style={{ padding: '20px 20px 8px', height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid stroke="#313644" strokeDasharray="3 3" />
                <XAxis dataKey="month" stroke="#948f84" fontSize={12} />
                <YAxis stroke="#948f84" fontSize={12} tickFormatter={(v) => `${v / 1000}k`} />
                <Tooltip
                  contentStyle={{ background: '#1c1f27', border: '1px solid #313644', fontSize: 12 }}
                  formatter={(v: number) => formatINR(v)}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="revenue" fill="#c9a24b" name="Revenue" radius={[3, 3, 0, 0]} />
                <Bar dataKey="expenses" fill="#b5524a" name="Expenses" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="two-col">
          <div className="panel">
            <div className="panel-head">
              <h3>Quotation status — {periodLabel.toLowerCase()}</h3>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Count</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><span className="badge due">Due</span></td>
                  <td className="num">{quotationStatusBreakdown.due.count}</td>
                  <td className="num">{formatINR(quotationStatusBreakdown.due.amount)}</td>
                </tr>
                <tr>
                  <td><span className="badge overdue">Overdue</span></td>
                  <td className="num">{quotationStatusBreakdown.overdue.count}</td>
                  <td className="num">{formatINR(quotationStatusBreakdown.overdue.amount)}</td>
                </tr>
                <tr>
                  <td><span className="badge paid">Fully Paid</span></td>
                  <td className="num">{quotationStatusBreakdown.paid.count}</td>
                  <td className="num">{formatINR(quotationStatusBreakdown.paid.amount)}</td>
                </tr>
                <tr>
                  <td><span className="badge converted">Invoiced</span></td>
                  <td className="num">{quotationStatusBreakdown.converted.count}</td>
                  <td className="num">{formatINR(quotationStatusBreakdown.converted.amount)}</td>
                </tr>
                <tr>
                  <td><span className="badge expired">Expired</span></td>
                  <td className="num">{quotationStatusBreakdown.expired.count}</td>
                  <td className="num">{formatINR(quotationStatusBreakdown.expired.amount)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h3>Top customers — {periodLabel.toLowerCase()}</h3>
            </div>
            <table>
              <tbody>
                {topCustomers.map((c) => (
                  <tr key={c.name}>
                    <td>{c.name}</td>
                    <td className="num">{formatINR(c.amount)}</td>
                  </tr>
                ))}
                {topCustomers.length === 0 && (
                  <tr>
                    <td className="row-sub">No quotations in this period.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="two-col">
          <div className="panel">
            <div className="panel-head">
              <h3>Expenses by category — {periodLabel.toLowerCase()}</h3>
            </div>
            <table>
              <tbody>
                {expenseByCategory.map(([category, amount]) => (
                  <tr key={category}>
                    <td>{category}</td>
                    <td className="num">{formatINR(amount)}</td>
                    <td className="row-sub" style={{ width: 50, textAlign: 'right' }}>
                      {expenseTotal > 0 ? ((amount / expenseTotal) * 100).toFixed(0) : 0}%
                    </td>
                  </tr>
                ))}
                {expenseByCategory.length === 0 && (
                  <tr>
                    <td className="row-sub">No expenses in this period.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h3>Top vendors — {periodLabel.toLowerCase()}</h3>
            </div>
            <table>
              <tbody>
                {topVendors.map((v) => (
                  <tr key={v.name}>
                    <td>{v.name}</td>
                    <td className="num">{formatINR(v.amount)}</td>
                  </tr>
                ))}
                {topVendors.length === 0 && (
                  <tr>
                    <td className="row-sub">No vendor purchases in this period.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h3>Quotations — {periodLabel.toLowerCase()}</h3>
          </div>
          <div className="stat-grid" style={{ padding: 20, marginBottom: 0 }}>
            <div className="facet-card">
              <div className="stat-label">Pending quotations</div>
              <div className="stat-value num">{quotationSummary.pendingCount}</div>
              <div className="stat-delta">{formatINR(quotationSummary.pendingAmount)} quoted</div>
            </div>
            <div className="facet-card">
              <div className="stat-label">Converted to invoice</div>
              <div className="stat-value num" style={{ color: 'var(--success)' }}>{quotationSummary.convertedCount}</div>
              <div className="stat-delta up">{formatINR(quotationSummary.convertedAmount)} won</div>
            </div>
          </div>
        </div>

        <div className="two-col">
          <div className="panel">
            <div className="panel-head">
              <h3>Slab breakdown — {periodLabel.toLowerCase()}</h3>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Slab</th>
                  <th>Quotations</th>
                  <th>Customers</th>
                  <th>Business</th>
                </tr>
              </thead>
              <tbody>
                {slabBreakdown.map((s) => (
                  <tr key={s.slab}>
                    <td>Slab {s.slab} <span className="row-sub">({s.percentLabel})</span></td>
                    <td className="num">{s.invoiceCount}</td>
                    <td className="num">{s.customerCount}</td>
                    <td className="num">{formatINR(s.amount)}</td>
                  </tr>
                ))}
                {periodQuotations.length === 0 && (
                  <tr>
                    <td className="row-sub">No quotations in this period.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h3>GST vs non-GST business — {periodLabel.toLowerCase()}</h3>
            </div>
            <div className="stat-grid" style={{ padding: 20, marginBottom: 0 }}>
              <div className="facet-card">
                <div className="stat-label">With GST</div>
                <div className="stat-value num">{formatINR(gstSplit.withGst.amount)}</div>
                <div className="stat-delta">{gstSplit.withGst.count} quotation{gstSplit.withGst.count === 1 ? '' : 's'}</div>
              </div>
              <div className="facet-card">
                <div className="stat-label">Without GST</div>
                <div className="stat-value num">{formatINR(gstSplit.withoutGst.amount)}</div>
                <div className="stat-delta">{gstSplit.withoutGst.count} quotation{gstSplit.withoutGst.count === 1 ? '' : 's'}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="two-col">
          <div className="panel">
            <div className="panel-head">
              <h3>Receivables outstanding (as of today)</h3>
              <button className="btn btn-ghost btn-small">Export</button>
            </div>
            <table>
              <tbody>
                {customers.filter((c) => c.outstanding > 0).map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td className="num" style={{ color: 'var(--warning)' }}>{formatINR(c.outstanding)}</td>
                  </tr>
                ))}
                <tr>
                  <td className="row-name">Total</td>
                  <td className="num row-name">{formatINR(totalReceivable)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h3>Payables outstanding (as of today)</h3>
              <button className="btn btn-ghost btn-small">Export</button>
            </div>
            <table>
              <tbody>
                {vendors.filter((v) => v.payable > 0).map((v) => (
                  <tr key={v.id}>
                    <td>{v.name}</td>
                    <td className="num" style={{ color: 'var(--warning)' }}>{formatINR(v.payable)}</td>
                  </tr>
                ))}
                <tr>
                  <td className="row-name">Total</td>
                  <td className="num row-name">{formatINR(totalPayable)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}