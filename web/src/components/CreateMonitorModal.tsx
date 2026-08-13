import { useState, type FormEvent } from 'react';
import { api, errorMessage } from '../lib/api';
import { useAuth } from '../context/AuthContext';

const INTERVALS = [30, 60, 300, 600, 1800, 3600];
const TYPES = ['HTTP', 'API', 'SSL', 'DNS', 'TCP', 'KEYWORD', 'JSON'];

export function CreateMonitorModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { activeOrg } = useAuth();
  const [form, setForm] = useState({
    name: '',
    type: 'HTTP',
    target: '',
    intervalSeconds: 60,
    timeoutMs: 10000,
    expectedStatus: '200',
    responseTimeThresholdMs: '',
    keyword: '',
    failureThreshold: 3,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const body = {
        name: form.name,
        type: form.type,
        target: form.target,
        intervalSeconds: form.intervalSeconds,
        timeoutMs: form.timeoutMs,
        expectedStatus: form.expectedStatus.split(',').map((s) => Number(s.trim())).filter(Boolean),
        failureThreshold: form.failureThreshold,
        ...(form.responseTimeThresholdMs ? { responseTimeThresholdMs: Number(form.responseTimeThresholdMs) } : {}),
        ...(form.keyword ? { keyword: form.keyword } : {}),
      };
      await api.post(`/orgs/${activeOrg!.id}/monitors`, body);
      onCreated();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="card max-h-[90vh] w-full max-w-lg overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-4 text-lg font-semibold">Create monitor</h2>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Type</label>
              <select className="input" value={form.type} onChange={(e) => set('type', e.target.value)}>
                {TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Check interval</label>
              <select className="input" value={form.intervalSeconds} onChange={(e) => set('intervalSeconds', Number(e.target.value))}>
                {INTERVALS.map((i) => (
                  <option key={i} value={i}>
                    {i < 60 ? `${i}s` : i < 3600 ? `${i / 60}m` : `${i / 3600}h`}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="label">Name</label>
            <input className="input" placeholder="Production API" value={form.name} onChange={(e) => set('name', e.target.value)} required />
          </div>

          <div>
            <label className="label">Target</label>
            <input
              className="input"
              placeholder={form.type === 'TCP' ? 'host:port' : 'https://example.com'}
              value={form.target}
              onChange={(e) => set('target', e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Timeout (ms)</label>
              <input className="input" type="number" value={form.timeoutMs} onChange={(e) => set('timeoutMs', Number(e.target.value))} />
            </div>
            <div>
              <label className="label">Expected status</label>
              <input className="input" placeholder="200" value={form.expectedStatus} onChange={(e) => set('expectedStatus', e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Response threshold (ms)</label>
              <input className="input" type="number" placeholder="optional" value={form.responseTimeThresholdMs} onChange={(e) => set('responseTimeThresholdMs', e.target.value)} />
            </div>
            <div>
              <label className="label">Failures before incident</label>
              <input className="input" type="number" min={1} value={form.failureThreshold} onChange={(e) => set('failureThreshold', Number(e.target.value))} />
            </div>
          </div>

          {(form.type === 'KEYWORD' || form.type === 'JSON') && (
            <div>
              <label className="label">Keyword</label>
              <input className="input" placeholder="Expected text in response" value={form.keyword} onChange={(e) => set('keyword', e.target.value)} />
            </div>
          )}

          {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/40 dark:text-red-300">{error}</div>}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button className="btn-primary" disabled={busy}>
              {busy ? 'Creating…' : 'Create monitor'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
