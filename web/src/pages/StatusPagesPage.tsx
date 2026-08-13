import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { EmptyState, PageHeader, Spinner } from '../components/ui';

interface StatusPage {
  id: string;
  name: string;
  slug: string;
  published: boolean;
  description: string | null;
  monitors: { monitorId: string }[];
}

export function StatusPagesPage() {
  const { activeOrg } = useAuth();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [busy, setBusy] = useState(false);

  const { data, isLoading } = useQuery<StatusPage[]>({
    queryKey: ['status-pages', activeOrg?.id],
    queryFn: async () => (await api.get(`/orgs/${activeOrg!.id}/status-pages`)).data.data,
    enabled: !!activeOrg,
  });

  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await api.post(`/orgs/${activeOrg!.id}/status-pages`, { name, ...(slug ? { slug } : {}) });
      setName('');
      setSlug('');
      qc.invalidateQueries({ queryKey: ['status-pages'] });
    } finally {
      setBusy(false);
    }
  }

  async function togglePublish(page: StatusPage) {
    await api.patch(`/orgs/${activeOrg!.id}/status-pages/${page.id}`, { published: !page.published });
    qc.invalidateQueries({ queryKey: ['status-pages'] });
  }

  return (
    <div>
      <PageHeader title="Status Pages" subtitle="Public pages for sharing your service status with customers." />

      <div className="mb-6 flex flex-wrap gap-2">
        <input className="input max-w-xs" placeholder="Page name" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="input max-w-[10rem]" placeholder="slug" value={slug} onChange={(e) => setSlug(e.target.value)} />
        <button className="btn-primary" onClick={create} disabled={busy}>Create page</button>
      </div>

      {isLoading ? (
        <Spinner />
      ) : !data || data.length === 0 ? (
        <EmptyState title="No status pages" description="Create a public status page to share uptime with your customers." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {data.map((p) => (
            <div key={p.id} className="card p-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">{p.name}</h3>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${p.published ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'}`}>
                  {p.published ? 'Published' : 'Draft'}
                </span>
              </div>
              <div className="mt-1 text-sm text-slate-500">
                /status/{p.slug} · {p.monitors.length} monitors
              </div>
              <div className="mt-3 flex gap-2">
                <a className="btn-ghost flex-1 py-1.5 text-xs" href={`/status/${p.slug}`} target="_blank" rel="noreferrer">
                  View
                </a>
                <button className="btn-ghost flex-1 py-1.5 text-xs" onClick={() => togglePublish(p)}>
                  {p.published ? 'Unpublish' : 'Publish'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
