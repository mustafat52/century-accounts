import { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import Topbar from '../components/Topbar';
import StatCard from '../components/StatCard';
import StatusBadge from '../components/StatusBadge';
import { useApp } from '../context/AppContext';
import { formatINR } from '../utils/format';

export default function Dashboard() {
  const { invoices, customers, vendors, monthlyFigures, dashboardSummary } = useApp();

  const stats = useMemo(() => {
    const outstandingReceivable = customers.reduce((sum, c) => sum + c.outstanding, 0);
    const outstandingPayable = vendors.reduce((sum, v) => sum + v.payable, 0);
    const overdueCount = invoices.filter((i) => i.status === 'overdue').length;
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
  }, [invoices, customers, vendors, monthlyFigures]);

  const recent = [...invoices].slice(0, 5);
  const customerName = (id: string) => customers.find((c) => c.id === id)?.name ?? '—';

  return (
    <>
      <Topbar title="Dashboard" subtitle="Overview of accounts as of today" />
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
            label="Overdue invoices"
            value={String(stats.overdueCount)}
            delta={stats.overdueCount > 0 ? 'Needs follow-up' : 'All clear'}
            deltaDirection={stats.overdueCount > 0 ? 'down' : 'up'}
          />
        </div>

        <div className="section-title">This month's activity</div>
        <div className="stat-grid">
          <StatCard label="Customers billed this month" value={String(dashboardSummary.customersBilledThisMonth)} />
          <StatCard label="Jobs in progress" value={String(dashboardSummary.jobsInProgress)} />
          <StatCard label="Jobs completed this month" value={String(dashboardSummary.jobsCompletedThisMonth)} />
        </div>

        <div className="two-col">
          <div className="panel">
            <div className="panel-head">
              <h3>Revenue vs Expenses — last 6 months</h3>
            </div>
            <div style={{ padding: '20px 20px 8px', height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthlyFigures}>
                  <CartesianGrid stroke="#313644" strokeDasharray="3 3" />
                  <XAxis dataKey="month" stroke="#948f84" fontSize={12} />
                  <YAxis stroke="#948f84" fontSize={12} tickFormatter={(v) => `${v / 1000}k`} />
                  <Tooltip
                    contentStyle={{ background: '#1c1f27', border: '1px solid #313644', fontSize: 12 }}
                    formatter={(v: number) => formatINR(v)}
                  />
                  <Line type="monotone" dataKey="revenue" stroke="#c9a24b" strokeWidth={2} dot={false} name="Revenue" />
                  <Line type="monotone" dataKey="expenses" stroke="#b5524a" strokeWidth={2} dot={false} name="Expenses" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h3>Needs attention</h3>
            </div>
            <table>
              <tbody>
                {invoices
                  .filter((i) => i.status === 'overdue')
                  .map((i) => (
                    <tr key={i.id}>
                      <td>
                        <div className="row-name">{customerName(i.customerId)}</div>
                        <div className="row-sub">{i.id} · due {i.dueDate}</div>
                      </td>
                      <td className="num">{formatINR(i.amount + i.gst + i.transportation)}</td>
                    </tr>
                  ))}
                {invoices.filter((i) => i.status === 'overdue').length === 0 && (
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
                  <td className="num">{formatINR(i.amount + i.gst + i.transportation)}</td>
                  <td>
                    <StatusBadge status={i.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}