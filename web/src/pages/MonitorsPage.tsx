import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import type { Monitor } from '../lib/types';
import { EmptyState, PageHeader, Spinner, timeAgo } from '../components/ui';
import { MonitorStatusBadge } from '../components/StatusBadge';
import { CreateMonitorModal } from '../components/CreateMonitorModal';

const TYPE_LABEL: Record<string, string> = {
  HTTP: 'HTTP',
  API: 'API',
  SSL: 'SSL',
  DNS: 'DNS',
  TCP: 'TCP',
  KEYWORD: 'Keyword',
  JSON: 'JSON',
};

export function MonitorsPage() {
  const { activeOrg } = useAuth();
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const { data, isLoading, refetch } = useQuery<{ monitors: Monitor[]; total: number }>({
    queryKey: ['monitors', activeOrg?.id, status, search],
    queryFn: async () =>
      (
        await api.get(`/orgs/${activeOrg!.id}/monitors`, {
          params: { status: status || undefined, search: search || undefined, pageSize: 100 },
        })
      ).data.data,
    enabled: !!activeOrg,
    refetchInterval: 15000,
  });

  return (
    <div>
      <PageHeader
        title="Monitors"
        subtitle={`${data?.total ?? 0} monitors`}
        actions={<button className="btn-primary" onClick={() => setShowCreate(true)}>New monitor</button>}
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <input className="input max-w-xs" placeholder="Search monitors…" value={search} onChange={(e) => setSearch(e.target.value)} />
        {['', 'UP', 'DOWN', 'DEGRADED', 'PAUSED', 'MAINTENANCE'].map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`btn-ghost px-3 py-1.5 text-xs ${status === s ? '!bg-brand-600 !text-white' : ''}`}
          >
            {s || 'All'}
          </button>
        ))}
      </div>

      {isLoading ? (
        <Spinner />
      ) : !data || data.monitors.length === 0 ? (
        <EmptyState
          title="You're not monitoring anything yet."
          description="Add your first website or API to start tracking availability and performance."
          action={<button className="btn-primary mt-2" onClick={() => setShowCreate(true)}>Create Monitor</button>}
        />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800">
                <th className="px-4 py-3 font-medium">Monitor</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Response</th>
                <th className="px-4 py-3 font-medium">Last checked</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.monitors.map((m) => (
                <tr key={m.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="px-4 py-3">
                    <Link to={`/monitors/${m.id}`} className="font-medium hover:text-brand-600">
                      {m.name}
                    </Link>
                    <div className="truncate text-xs text-slate-500">{m.target}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{TYPE_LABEL[m.type] ?? m.type}</td>
                  <td className="px-4 py-3">
                    <MonitorStatusBadge status={m.status} />
                  </td>
                  <td className="px-4 py-3 text-slate-500">{m.lastResponseTimeMs != null ? `${m.lastResponseTimeMs} ms` : '—'}</td>
                  <td className="px-4 py-3 text-slate-500">{timeAgo(m.lastCheckAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && <CreateMonitorModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); refetch(); }} />}
    </div>
  );
}
