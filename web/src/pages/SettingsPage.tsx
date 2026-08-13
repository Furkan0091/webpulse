import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { PageHeader, Spinner, formatDate } from '../components/ui';

type Tab = 'members' | 'channels' | 'api-keys';

export function SettingsPage() {
  const { activeOrg, user } = useAuth();
  const [tab, setTab] = useState<Tab>('members');
  return (
    <div>
      <PageHeader title="Settings" subtitle="Manage your organization, notifications and API access." />
      <div className="mb-6 flex gap-2">
        {(['members', 'channels', 'api-keys'] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`btn-ghost px-3 py-1.5 text-sm capitalize ${tab === t ? '!bg-brand-600 !text-white' : ''}`}>
            {t.replace('-', ' ')}
          </button>
        ))}
      </div>
      {tab === 'members' && <Members />}
      {tab === 'channels' && <Channels />}
      {tab === 'api-keys' && <ApiKeys />}
      {user && <div className="mt-6 text-xs text-slate-400">Signed in as {user.email}</div>}
    </div>
  );
}

function Members() {
  const { activeOrg } = useAuth();
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('DEVELOPER');
  const [msg, setMsg] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['members', activeOrg?.id],
    queryFn: async () => (await api.get(`/orgs/${activeOrg!.id}/members`)).data.data,
    enabled: !!activeOrg,
  });

  async function invite() {
    setMsg('');
    try {
      await api.post(`/orgs/${activeOrg!.id}/members/invite`, { email, role });
      setEmail('');
      qc.invalidateQueries({ queryKey: ['members'] });
    } catch (e) {
      setMsg(errorMessage(e));
    }
  }

  if (isLoading) return <Spinner />;
  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        <input className="input max-w-xs" placeholder="member@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <select className="input max-w-[10rem]" value={role} onChange={(e) => setRole(e.target.value)}>
          <option>ADMIN</option>
          <option>DEVELOPER</option>
          <option>VIEWER</option>
        </select>
        <button className="btn-primary" onClick={invite}>Invite</button>
      </div>
      {msg && <div className="mb-3 text-sm text-red-600">{msg}</div>}
      <div className="card divide-y divide-slate-100 dark:divide-slate-800">
        {data?.map((m: { id: string; role: string; status: string; joinedAt: string; user: { name: string; email: string } }) => (
          <div key={m.id} className="flex items-center justify-between px-4 py-3">
            <div>
              <div className="text-sm font-medium">{m.user.name}</div>
              <div className="text-xs text-slate-500">{m.user.email}</div>
            </div>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">{m.role}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Channels() {
  const { activeOrg } = useAuth();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [type, setType] = useState('EMAIL');
  const [config, setConfig] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['channels', activeOrg?.id],
    queryFn: async () => (await api.get(`/orgs/${activeOrg!.id}/channels`)).data.data,
    enabled: !!activeOrg,
  });

  async function create() {
    try {
      await api.post(`/orgs/${activeOrg!.id}/channels`, { name, type, config: config ? JSON.parse(config) : {} });
      setName('');
      setConfig('');
      qc.invalidateQueries({ queryKey: ['channels'] });
    } catch (e) {
      alert(errorMessage(e));
    }
  }

  if (isLoading) return <Spinner />;
  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        <input className="input max-w-[10rem]" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <select className="input max-w-[10rem]" value={type} onChange={(e) => setType(e.target.value)}>
          <option>EMAIL</option>
          <option>SLACK</option>
          <option>DISCORD</option>
          <option>TEAMS</option>
        </select>
        <input className="input max-w-xs" placeholder={type === 'EMAIL' ? '{"email":"ops@x.com"}' : '{"webhookUrl":"https://…"}'} value={config} onChange={(e) => setConfig(e.target.value)} />
        <button className="btn-primary" onClick={create}>Add channel</button>
      </div>
      <div className="card divide-y divide-slate-100 dark:divide-slate-800">
        {data?.map((c: { id: string; name: string; type: string; enabled: boolean }) => (
          <div key={c.id} className="flex items-center justify-between px-4 py-3">
            <div>
              <div className="text-sm font-medium">{c.name}</div>
              <div className="text-xs text-slate-500">{c.type}</div>
            </div>
            <span className={`text-xs ${c.enabled ? 'text-emerald-600' : 'text-slate-400'}`}>{c.enabled ? 'Active' : 'Disabled'}</span>
          </div>
        ))}
        {!data?.length && <div className="p-4 text-sm text-slate-500">No channels configured.</div>}
      </div>
    </div>
  );
}

function ApiKeys() {
  const { activeOrg } = useAuth();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [created, setCreated] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['api-keys', activeOrg?.id],
    queryFn: async () => (await api.get(`/orgs/${activeOrg!.id}/api-keys`)).data.data,
    enabled: !!activeOrg,
  });

  async function create() {
    try {
      const res = await api.post(`/orgs/${activeOrg!.id}/api-keys`, { name, scopes: ['monitors:read', 'incidents:read', 'status:read'] });
      setCreated(res.data.data.key);
      setName('');
      qc.invalidateQueries({ queryKey: ['api-keys'] });
    } catch (e) {
      alert(errorMessage(e));
    }
  }

  async function revoke(id: string) {
    await api.delete(`/orgs/${activeOrg!.id}/api-keys/${id}`);
    qc.invalidateQueries({ queryKey: ['api-keys'] });
  }

  if (isLoading) return <Spinner />;
  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        <input className="input max-w-xs" placeholder="Key name" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn-primary" onClick={create}>Create key</button>
      </div>
      {created && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/30">
          <div className="text-xs font-medium text-amber-700 dark:text-amber-300">Copy this key now — it will not be shown again.</div>
          <code className="mt-1 block break-all text-sm">{created}</code>
        </div>
      )}
      <div className="card divide-y divide-slate-100 dark:divide-slate-800">
        {data?.map((k: { id: string; name: string; prefix: string; scopes: string[]; lastUsedAt: string | null; createdAt: string }) => (
          <div key={k.id} className="flex items-center justify-between px-4 py-3">
            <div>
              <div className="text-sm font-medium">{k.name}</div>
              <code className="text-xs text-slate-500">{k.prefix}…</code>
              <div className="text-xs text-slate-400">{k.scopes.join(', ')}</div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-400">last used {k.lastUsedAt ? formatDate(k.lastUsedAt) : 'never'}</span>
              <button className="text-xs text-red-600 hover:underline" onClick={() => revoke(k.id)}>Revoke</button>
            </div>
          </div>
        ))}
        {!data?.length && <div className="p-4 text-sm text-slate-500">No API keys.</div>}
      </div>
    </div>
  );
}
