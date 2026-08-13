import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Analytics } from '../lib/types';

export function ResponseTimeChart({ analytics }: { analytics: Analytics }) {
  const data = analytics.series.map((s) => ({
    ts: new Date(s.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    rt: s.avgResponseTimeMs,
  }));

  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
        <defs>
          <linearGradient id="rt" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#334155" strokeOpacity={0.15} />
        <XAxis dataKey="ts" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={40} />
        <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} unit="ms" width={60} />
        <Tooltip
          contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: '#94a3b8' }}
          formatter={(v) => [`${v} ms`, 'Response']}
        />
        <Area type="monotone" dataKey="rt" stroke="#6366f1" strokeWidth={2} fill="url(#rt)" connectNulls />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function UptimeChart({ analytics }: { analytics: Analytics }) {
  const data = analytics.series.map((s) => ({
    ts: new Date(s.ts).toLocaleDateString([], { month: 'short', day: 'numeric' }),
    uptime: s.uptimePct,
  }));

  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
        <defs>
          <linearGradient id="up" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#334155" strokeOpacity={0.15} />
        <XAxis dataKey="ts" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={40} />
        <YAxis domain={[90, 100]} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} unit="%" width={60} />
        <Tooltip
          contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: '#94a3b8' }}
          formatter={(v) => [`${v}%`, 'Uptime']}
        />
        <Area type="monotone" dataKey="uptime" stroke="#10b981" strokeWidth={2} fill="url(#up)" connectNulls />
      </AreaChart>
    </ResponsiveContainer>
  );
}
