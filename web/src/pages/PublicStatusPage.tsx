import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api';
import type { PublicStatus } from '../lib/types';
import { Spinner } from '../components/ui';

function overallLabel(status: string): string {
  switch (status) {
    case 'UP': return 'All Systems Operational';
    case 'DEGRADED': return 'Degraded Performance';
    case 'DOWN': return 'Major Outage';
    case 'MAINTENANCE': return 'Scheduled Maintenance';
    default: return 'Unknown';
  }
}

const STATUS_ROW: Record<string, string> = {
  UP: 'Operational',
  OPERATIONAL: 'Operational',
  DOWN: 'Down',
  DEGRADED: 'Degraded',
  MAINTENANCE: 'Maintenance',
  PENDING: 'Pending',
};

export function PublicStatusPage() {
  const { slug } = useParams();
  const { data, isLoading, error } = useQuery<PublicStatus>({
    queryKey: ['public-status', slug],
    queryFn: async () => (await api.get(`/public/status/${slug}`)).data.data,
    enabled: !!slug,
    refetchInterval: 30000,
  });

  if (isLoading) return <Spinner />;
  if (error || !data) {
    return <div className="flex min-h-screen items-center justify-center text-slate-500">Status page not found.</div>;
  }

  const banner =
    data.overall === 'UP' ? 'bg-emerald-500' : data.overall === 'DOWN' ? 'bg-red-500' : data.overall === 'DEGRADED' ? 'bg-amber-500' : 'bg-sky-500';

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950">
      <div className={`${banner} px-6 py-8 text-white`}>
        <div className="mx-auto max-w-3xl">
          <h1 className="text-2xl font-semibold">{data.name}</h1>
          <p className="mt-1 text-white/90">{overallLabel(data.overall)}</p>
          {data.description && <p className="mt-2 text-sm text-white/80">{data.description}</p>}
        </div>
      </div>

      <div className="mx-auto max-w-3xl space-y-6 p-6">
        {data.activeIncidents.length > 0 && (
          <section className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-900/20">
            <h2 className="mb-2 text-sm font-semibold text-red-700 dark:text-red-300">Active incidents</h2>
            {data.activeIncidents.map((i) => (
              <div key={i.id} className="mb-2">
                <div className="font-medium text-red-700 dark:text-red-200">{i.title}</div>
                <div className="text-xs text-red-600/80 dark:text-red-300/80">{i.monitor.name} · {i.status}</div>
              </div>
            ))}
          </section>
        )}

        {data.maintenance.length > 0 && (
          <section className="rounded-xl border border-sky-200 bg-sky-50 p-4 dark:border-sky-900/50 dark:bg-sky-900/20">
            <h2 className="mb-2 text-sm font-semibold text-sky-700 dark:text-sky-300">Scheduled maintenance</h2>
            {data.maintenance.map((m) => (
              <div key={m.title} className="text-sm text-sky-700 dark:text-sky-200">
                <span className="font-medium">{m.title}</span>
                {m.description && <span className="text-xs"> — {m.description}</span>}
              </div>
            ))}
          </section>
        )}

        <section className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          {data.monitors.map((m, i) => (
            <div key={m.id} className={`flex items-center justify-between px-4 py-3 ${i > 0 ? 'border-t border-slate-100 dark:border-slate-800' : ''}`}>
              <span className="font-medium">{m.name}</span>
              <span className="flex items-center gap-2 text-sm">
                <span className={`h-2.5 w-2.5 rounded-full ${
                  m.status === 'UP' ? 'bg-emerald-500' : m.status === 'DOWN' ? 'bg-red-500' : m.status === 'DEGRADED' ? 'bg-amber-500' : 'bg-sky-500'
                }`} />
                <span className="text-slate-600 dark:text-slate-300">{STATUS_ROW[m.status] ?? m.status}</span>
              </span>
            </div>
          ))}
        </section>

        <footer className="text-center text-xs text-slate-400">Powered by WebPulse</footer>
      </div>
    </div>
  );
}
