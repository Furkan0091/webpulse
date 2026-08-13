import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import type { Incident } from '../lib/types';
import { EmptyState, PageHeader, Spinner, durationLabel, timeAgo } from '../components/ui';
import { IncidentStatusBadge, SeverityBadge } from '../components/StatusBadge';

export function IncidentsPage() {
  const { activeOrg } = useAuth();
  const [status, setStatus] = useState('');
  const { data, isLoading } = useQuery<{ incidents: Incident[]; total: number }>({
    queryKey: ['incidents', activeOrg?.id, status],
    queryFn: async () => (await api.get(`/orgs/${activeOrg!.id}/incidents`, { params: { status: status || undefined, pageSize: 100 } })).data.data,
    enabled: !!activeOrg,
    refetchInterval: 15000,
  });

  return (
    <div>
      <PageHeader title="Incidents" subtitle={`${data?.total ?? 0} incidents`} />

      <div className="mb-4 flex gap-2">
        {['', 'INVESTIGATING', 'IDENTIFIED', 'MONITORING', 'RESOLVED'].map((s) => (
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
      ) : !data || data.incidents.length === 0 ? (
        <EmptyState title="No incidents" description="Incidents appear automatically when a monitor fails repeatedly." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500 dark:border-slate-800">
                <th className="px-4 py-3 font-medium">Incident</th>
                <th className="px-4 py-3 font-medium">Monitor</th>
                <th className="px-4 py-3 font-medium">Severity</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Started</th>
                <th className="px-4 py-3 font-medium">Duration</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.incidents.map((i) => (
                <tr key={i.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="px-4 py-3">
                    <Link to={`/incidents/${i.id}`} className="font-medium hover:text-brand-600">
                      {i.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{i.monitor.name}</td>
                  <td className="px-4 py-3"><SeverityBadge severity={i.severity} /></td>
                  <td className="px-4 py-3"><IncidentStatusBadge status={i.status} /></td>
                  <td className="px-4 py-3 text-slate-500">{timeAgo(i.startedAt)}</td>
                  <td className="px-4 py-3 text-slate-500">{durationLabel(i.durationSeconds)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
