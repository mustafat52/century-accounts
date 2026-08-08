interface StatCardProps {
  label: string;
  value: string;
  delta?: string;
  deltaDirection?: 'up' | 'down';
}

export default function StatCard({ label, value, delta, deltaDirection }: StatCardProps) {
  return (
    <div className="facet-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value num">{value}</div>
      {delta && <div className={`stat-delta ${deltaDirection ?? ''}`}>{delta}</div>}
    </div>
  );
}
