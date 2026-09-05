import { useMemo } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import Topbar from '../components/Topbar';
import StatCard from '../components/StatCard';
import StatusBadge from '../components/StatusBadge';
import { useApp } from '../context/AppContext';
import { formatINR } from '../utils/format';

// The 30-day due/overdue clock always runs from the quotation's creation
// date — same rule as quotations_effective in schema.sql, computed here
// purely for the "due X" display text.
function dueDateFor(dateStr: string): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
}

export default function Dashboard() {
  const { invoices, quotations, customers, vendors, monthlyFigures, dashboardSummary } = useApp();

  const stats = useMemo(() => {
    const outstandingReceivable = customers.reduce((sum, c) => sum + c.outstanding, 0);
    const outstandingPayable = vendors.reduce((sum, v) => sum + v.payable, 0);
    const overdueCount = quotations.filter((q) => q.effectiveStatus === 'overdue').length;
    const thisMonth = monthlyFigures[monthlyFigures.length - 1];
    const lastMonth = monthlyFigures[monthlyFigures.length - 2];
    let revenueDelta: string | null = null;
    if (thisMonth && lastMonth) {
      if (lastMonth.revenue === 0) {
        revenueDelta = thisMonth.revenue > 0 ? 'new' : null;
      } else {
        revenueDelta = (((thisMonth.revenue - lastMonth.revenue) / lastMonth.revenue) * 100).toFixed(1);
      }
    }

    return { outstandingReceivable, outstandingPayable, overdueCount, thisMonth, revenueDelta };
  }, [quotations, customers, vendors, monthlyFigures]);

  const recent = [...invoices].slice(0, 5);
  const overdueQuotations = quotations.filter((q) => q.effectiveStatus === 'overdue');
  const customerName = (id: string) => customers.find((c) => c.id === id)?.name ?? '—';

  const revenueVsExpensePie = useMemo(() => {
    const last6 = monthlyFigures.slice(-6);
    const revenue = last6.reduce((sum, m) => sum + m.revenue, 0);
    const expenses = last6.reduce((sum, m) => sum + m.expenses, 0);
    return [
      { name: 'Revenue', value: revenue, color: '#c9a24b' },
      { name: 'Expenses', value: expenses, color: '#b5524a' },
    ];
  }, [monthlyFigures]);
  const hasPieData = revenueVsExpensePie.some((d) => d.value > 0);

  return (
    <>
      <Topbar title="Dashboard" subtitle="Overview of accounts as of today" showInvoiceActions />
      <div className="view-body">
        <div className="stat-grid">
          <StatCard
            label="Revenue this month"
            value={formatINR(stats.thisMonth?.revenue ?? 0)}
            delta={
              stats.revenueDelta === 'new'
                ? 'First revenue this period'
                : stats.revenueDelta
                ? `${Number(stats.revenueDelta) >= 0 ? '+' : ''}${stats.revenueDelta}% vs last month`
                : undefined
            }
            deltaDirection={
              stats.revenueDelta === 'new' || (stats.revenueDelta && Number(stats.revenueDelta) >= 0) ? 'up' : 'down'
            }
          />
          <StatCard label="Outstanding receivables" value={formatINR(stats.outstandingReceivable)} />
          <StatCard label="Outstanding payables" value={formatINR(stats.outstandingPayable)} />
          <StatCard
            label="Overdue quotations"
            value={String(stats.overdueCount)}
            delta={stats.overdueCount > 0 ? 'Needs follow-up' : 'All clear'}
            deltaDirection={stats.overdueCount > 0 ? 'down' : 'up'}
          />
        </div>

        <div className="section-title">This month's activity</div>
        <div className="stat-grid">
          <StatCard label="Customers paid this month" value={String(dashboardSummary.customersPaidThisMonth)} />
          <StatCard label="Active quotations" value={String(dashboardSummary.quotationsActive)} />
          <StatCard label="Jobs settled this month" value={String(dashboardSummary.jobsCompletedThisMonth)} />
        </div>

        <div className="two-col">
          <div className="panel">
            <div className="panel-head">
              <h3>Revenue vs Expenses — last 6 months</h3>
            </div>
            <div style={{ padding: '20px 20px 8px', height: 280 }}>
              {hasPieData ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart margin={{ top: 16, right: 16, bottom: 16, left: 16 }}>
                    <Pie
                      data={revenueVsExpensePie}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={78}
                      label={({ percent }) => `${((percent ?? 0) * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {revenueVsExpensePie.map((d) => (
                        <Cell key={d.name} fill={d.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: '#1c1f27', border: '1px solid #313644', fontSize: 12 }}
                      formatter={(v: number) => formatINR(v)}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="row-sub" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                  No revenue or expenses recorded in the last 6 months yet.
                </div>
              )}
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h3>Needs attention</h3>
            </div>
            <table>
              <tbody>
                {overdueQuotations.map((q) => (
                  <tr key={q.id}>
                    <td>
                      <div className="row-name">{customerName(q.customerId)}</div>
                      <div className="row-sub">{q.id} · due {dueDateFor(q.date)}</div>
                    </td>
                    <td className="num">{formatINR(q.balanceAmount)}</td>
                  </tr>
                ))}
                {overdueQuotations.length === 0 && (
                  <tr>
                    <td className="row-sub">Nothing overdue right now.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h3>Recent invoices</h3>
          </div>
          <table>
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Customer</th>
                <th>Description</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((i) => (
                <tr key={i.id}>
                  <td>{i.id}</td>
                  <td>{customerName(i.customerId)}</td>
                  <td className="row-sub">{i.description}</td>
                  <td className="num">{formatINR(i.amount - i.discountAmount + i.gst + i.transportation)}</td>
                  <td>
                    <StatusBadge status="converted" />
                  </td>
                </tr>
              ))}
              {recent.length === 0 && (
                <tr>
                  <td className="row-sub">No settled invoices yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
