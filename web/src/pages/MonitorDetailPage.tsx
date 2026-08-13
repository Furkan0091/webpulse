import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import type { Analytics, CheckResult, Incident, Monitor } from '../lib/types';
import { EmptyState, Spinner, StatCard, formatDate, timeAgo } from '../components/ui';
import { MonitorStatusBadge } from '../components/StatusBadge';
import { ResponseTimeChart, UptimeChart } from '../components/charts';

const RANGES = ['1h', '24h', '7d', '30d', '90d'];

export function MonitorDetailPage() {
  const { activeOrg } = useAuth();
  const { monitorId } = useParams();
  const [range, setRange] = useState('24h');

  const { data: monitor, isLoading } = useQuery<Monitor>({
    queryKey: ['monitor', activeOrg?.id, monitorId],
    queryFn: async () => (await api.get(`/orgs/${activeOrg!.id}/monitors/${monitorId}`)).data.data,
    enabled: !!activeOrg && !!monitorId,
    refetchInterval: 15000,
  });

  const { data: analytics } = useQuery<Analytics>({
    queryKey: ['monitor-analytics', activeOrg?.id, monitorId, range],
    queryFn: async () => (await api.get(`/orgs/${activeOrg!.id}/monitors/${monitorId}/analytics`, { params: { range } })).data.data,
    enabled: !!activeOrg && !!monitorId,
  });

  const { data: checks } = useQuery<{ checks: CheckResult[] }>({
    queryKey: ['monitor-checks', activeOrg?.id, monitorId],
    queryFn: async () => (await api.get(`/orgs/${activeOrg!.id}/monitors/${monitorId}/checks`, { params: { pageSize: 10 } })).data.data,
    enabled: !!activeOrg && !!monitorId,
    refetchInterval: 30000,
  });

  const { data: incidents } = useQuery<{ incidents: Incident[] }>({
    queryKey: ['monitor-incidents', activeOrg?.id, monitorId],
    queryFn: async () => (await api.get(`/orgs/${activeOrg!.id}/incidents`, { params: { monitorId, pageSize: 5 } })).data.data,
    enabled: !!activeOrg && !!monitorId,
  });

  if (isLoading) return <Spinner />;
  if (!monitor) return <EmptyState title="Monitor not found" description="This monitor does not exist or you do not have access." />;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link to="/monitors" className="text-sm text-slate-500 hover:text-brand-600">
            ← Monitors
          </Link>
          <div className="mt-1 flex items-center gap-3">
            <h1 className="text-xl font-semibold">{monitor.name}</h1>
            <MonitorStatusBadge status={monitor.status} />
          </div>
          <div className="text-sm text-slate-500">{monitor.target}</div>
        </div>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`rounded-md px-2 py-1 text-xs font-medium ${range === r ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {analytics && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Uptime" value={`${analytics.uptimePct.toFixed(2)}%`} />
          <StatCard label="Avg Response" value={analytics.responseTime.avg != null ? `${analytics.responseTime.avg} ms` : '—'} />
          <StatCard label="P95" value={analytics.responseTime.p95 != null ? `${analytics.responseTime.p95} ms` : '—'} />
          <StatCard label="Checks" value={analytics.totalChecks} sub={`${analytics.downChecks} down · ${analytics.degradedChecks} degraded`} />
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="card p-4">
          <h3 className="mb-2 text-sm font-semibold">Response time</h3>
          {analytics ? <ResponseTimeChart analytics={analytics} /> : <SkeletonBox />}
        </div>
        <div className="card p-4">
          <h3 className="mb-2 text-sm font-semibold">Uptime</h3>
          {analytics ? <UptimeChart analytics={analytics} /> : <SkeletonBox />}
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section>
          <h3 className="mb-2 text-sm font-semibold">Recent checks</h3>
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500 dark:border-slate-800">
                  <th className="px-3 py-2 font-medium">Time</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">HTTP</th>
                  <th className="px-3 py-2 font-medium">Response</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {checks?.checks.map((c) => (
                  <tr key={c.id}>
                    <td className="px-3 py-2 text-slate-500">{formatDate(c.checkedAt)}</td>
                    <td className="px-3 py-2">
                      <span className={`font-medium ${c.status === 'UP' ? 'text-emerald-600 dark:text-emerald-400' : c.status === 'DEGRADED' ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`}>
                        {c.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-500">{c.httpStatus ?? '—'}</td>
                    <td className="px-3 py-2 text-slate-500">{c.responseTimeMs != null ? `${c.responseTimeMs} ms` : '—'}</td>
                  </tr>
                ))}
                {!checks?.checks.length && <tr><td colSpan={4} className="px-3 py-4 text-center text-slate-500">No checks yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold">Recent incidents</h3>
          <div className="card divide-y divide-slate-100 dark:divide-slate-800">
            {incidents?.incidents.map((i) => (
              <Link key={i.id} to={`/incidents/${i.id}`} className="block px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <div className="text-sm font-medium">{i.title}</div>
                <div className="text-xs text-slate-500">{timeAgo(i.startedAt)} · {i.status}</div>
              </Link>
            ))}
            {!incidents?.incidents.length && <div className="p-4 text-sm text-slate-500">No incidents.</div>}
          </div>

          <h3 className="mb-2 mt-6 text-sm font-semibold">Configuration</h3>
          <div className="card p-4 text-sm">
            <dl className="grid grid-cols-2 gap-y-2">
              <dt className="text-slate-500">Type</dt><dd>{monitor.type}</dd>
              <dt className="text-slate-500">Interval</dt><dd>{monitor.intervalSeconds}s</dd>
              <dt className="text-slate-500">Timeout</dt><dd>{monitor.timeoutMs}ms</dd>
              <dt className="text-slate-500">Last check</dt><dd>{timeAgo(monitor.lastCheckAt)}</dd>
            </dl>
          </div>
        </section>
      </div>
    </div>
  );
}

function SkeletonBox() {
  return <div className="h-[240px] animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />;
}
