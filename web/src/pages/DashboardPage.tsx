import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import type { Dashboard } from '../lib/types';
import { EmptyState, PageHeader, Skeleton, StatCard, timeAgo } from '../components/ui';
import { MonitorStatusBadge, SeverityBadge, statusDot } from '../components/StatusBadge';

export function DashboardPage() {
  const { activeOrg } = useAuth();
  const { data, isLoading, error } = useQuery<Dashboard>({
    queryKey: ['dashboard', activeOrg?.id],
    queryFn: async () => (await api.get(`/orgs/${activeOrg!.id}/dashboard`)).data.data,
    enabled: !!activeOrg,
    refetchInterval: 15000,
  });

  if (!activeOrg) {
    return <EmptyState title="No organization" description="Create an organization to start monitoring." />;
  }
  if (isLoading) {
    return (
      <div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      </div>
    );
  }
  if (error || !data) {
    return <div className="text-sm text-red-600">Failed to load dashboard.</div>;
  }

  const greeting = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div>
      <PageHeader
        title={`${greeting}.`}
        subtitle={
          data.attentionMonitors.length
            ? `${data.attentionMonitors.length} monitor${data.attentionMonitors.length > 1 ? 's' : ''} need attention.`
            : 'All systems are healthy.'
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Uptime (24h)" value={`${data.uptime.pct.toFixed(2)}%`} tone={data.uptime.pct >= 99.9 ? 'good' : 'warn'} />
        <StatCard label="Active Monitors" value={data.monitors.total} />
        <StatCard label="Active Incidents" value={data.activeIncidents} tone={data.activeIncidents ? 'bad' : 'good'} />
        <StatCard label="Avg Response" value={data.uptime.avgResponseTimeMs ? `${data.uptime.avgResponseTimeMs} ms` : '—'} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Operational" value={data.monitors.operational} tone="good" />
        <StatCard label="Degraded" value={data.monitors.degraded} tone="warn" />
        <StatCard label="Down" value={data.monitors.down} tone="bad" />
        <StatCard label="Maintenance" value={data.monitors.maintenance} />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold">Monitors needing attention</h2>
            <Link to="/monitors" className="text-sm text-brand-600 hover:underline">
              View all
            </Link>
          </div>
          {data.attentionMonitors.length === 0 ? (
            <div className="card p-6 text-sm text-slate-500">No monitors need attention right now. 🎉</div>
          ) : (
            <div className="card divide-y divide-slate-100 dark:divide-slate-800">
              {data.attentionMonitors.map((m) => (
                <Link key={m.id} to={`/monitors/${m.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${statusDot(m.status)}`} />
                    <span className="text-sm font-medium">{m.name}</span>
                  </div>
                  <MonitorStatusBadge status={m.status} />
                </Link>
              ))}
            </div>
          )}
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold">Active incidents</h2>
            <Link to="/incidents" className="text-sm text-brand-600 hover:underline">
              View all
            </Link>
          </div>
          {data.recentIncidents.length === 0 ? (
            <div className="card p-6 text-sm text-slate-500">No active incidents.</div>
          ) : (
            <div className="card divide-y divide-slate-100 dark:divide-slate-800">
              {data.recentIncidents.map((i) => (
                <Link key={i.id} to={`/incidents/${i.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <div>
                    <div className="text-sm font-medium">{i.title}</div>
                    <div className="text-xs text-slate-500">{i.monitor.name} · {timeAgo(i.startedAt)}</div>
                  </div>
                  <SeverityBadge severity={i.severity} />
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="mt-8">
        <h2 className="mb-3 text-base font-semibold">Recent activity</h2>
        <div className="card divide-y divide-slate-100 dark:divide-slate-800">
          {data.recentActivity.map((a) => (
            <div key={a.id} className="flex items-center justify-between px-4 py-2.5">
              <span className="text-sm">{a.message}</span>
              <span className="text-xs text-slate-500">{timeAgo(a.createdAt)}</span>
            </div>
          ))}
          {data.recentActivity.length === 0 && <div className="p-4 text-sm text-slate-500">No recent activity.</div>}
        </div>
      </section>
    </div>
  );
}
