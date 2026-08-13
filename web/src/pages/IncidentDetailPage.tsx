import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { api, errorMessage } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import type { IncidentDetail } from '../lib/types';
import { EmptyState, Spinner, durationLabel, formatDate } from '../components/ui';
import { IncidentStatusBadge, SeverityBadge } from '../components/StatusBadge';

export function IncidentDetailPage() {
  const { activeOrg } = useAuth();
  const { incidentId } = useParams();
  const qc = useQueryClient();
  const [comment, setComment] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const { data: incident, isLoading } = useQuery<IncidentDetail>({
    queryKey: ['incident', activeOrg?.id, incidentId],
    queryFn: async () => (await api.get(`/orgs/${activeOrg!.id}/incidents/${incidentId}`)).data.data,
    enabled: !!activeOrg && !!incidentId,
    refetchInterval: 15000,
  });

  if (isLoading) return <Spinner />;
  if (!incident) return <EmptyState title="Incident not found" description="This incident does not exist or you do not have access." />;

  async function acknowledge() {
    setBusy(true);
    try {
      await api.post(`/orgs/${activeOrg!.id}/incidents/${incidentId}/acknowledge`, { comment });
      qc.invalidateQueries({ queryKey: ['incident'] });
      setComment('');
    } finally {
      setBusy(false);
    }
  }

  async function addNote() {
    setBusy(true);
    try {
      await api.post(`/orgs/${activeOrg!.id}/incidents/${incidentId}/notes`, { content: note });
      qc.invalidateQueries({ queryKey: ['incident'] });
      setNote('');
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(status: string) {
    try {
      await api.patch(`/orgs/${activeOrg!.id}/incidents/${incidentId}/status`, { status });
      qc.invalidateQueries({ queryKey: ['incident'] });
    } catch (e) {
      alert(errorMessage(e));
    }
  }

  return (
    <div>
      <Link to="/incidents" className="text-sm text-slate-500 hover:text-brand-600">← Incidents</Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">{incident.title}</h1>
        <IncidentStatusBadge status={incident.status} />
        <SeverityBadge severity={incident.severity} />
      </div>
      <div className="mt-1 text-sm text-slate-500">
        {incident.monitor.name} · started {formatDate(incident.startedAt)} · duration {durationLabel(incident.durationSeconds)}
      </div>
      {incident.cause && <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{incident.cause}</p>}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section>
          <h3 className="mb-2 text-sm font-semibold">Timeline</h3>
          <ol className="card relative space-y-0 p-2">
            {incident.events.map((e, idx) => (
              <li key={e.id} className="relative flex gap-3 px-3 py-2">
                <div className="flex flex-col items-center">
                  <div className={`h-2.5 w-2.5 rounded-full ${e.type === 'RESOLVED' ? 'bg-emerald-500' : e.type === 'FAILED_CHECK' ? 'bg-red-500' : 'bg-brand-500'}`} />
                  {idx < incident.events.length - 1 && <div className="w-px flex-1 bg-slate-200 dark:bg-slate-700" />}
                </div>
                <div className="pb-3">
                  <div className="text-sm">{e.message}</div>
                  <div className="text-xs text-slate-500">{formatDate(e.createdAt)}</div>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold">Actions</h3>
          {incident.status !== 'RESOLVED' && (
            <div className="card space-y-3 p-4">
              <div className="flex gap-2">
                {(['INVESTIGATING', 'IDENTIFIED', 'MONITORING'] as const).map((s) => (
                  <button key={s} onClick={() => setStatus(s)} disabled={incident.status === s} className={`btn-ghost px-3 py-1.5 text-xs ${incident.status === s ? '!bg-brand-600 !text-white' : ''}`}>
                    {s}
                  </button>
                ))}
              </div>
              {!incident.acknowledgedAt && (
                <div className="flex gap-2">
                  <input className="input" placeholder="Acknowledge with a comment…" value={comment} onChange={(e) => setComment(e.target.value)} />
                  <button className="btn-primary whitespace-nowrap" onClick={acknowledge} disabled={busy}>Acknowledge</button>
                </div>
              )}
              {incident.acknowledgedAt && (
                <div className="text-xs text-slate-500">Acknowledged by {incident.acknowledgedBy?.name} at {formatDate(incident.acknowledgedAt)}</div>
              )}
            </div>
          )}

          <h3 className="mb-2 mt-6 text-sm font-semibold">Notes</h3>
          <div className="card space-y-3 p-4">
            {incident.notes.map((n) => (
              <div key={n.id} className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
                <div className="text-sm">{n.content}</div>
                <div className="mt-1 text-xs text-slate-500">{n.user.name} · {formatDate(n.createdAt)}</div>
              </div>
            ))}
            <div className="flex gap-2">
              <input className="input" placeholder="Add an internal note…" value={note} onChange={(e) => setNote(e.target.value)} />
              <button className="btn-primary whitespace-nowrap" onClick={addNote} disabled={busy || !note.trim()}>Add</button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
