import type { IncidentStatus, MonitorStatus, Severity } from '../lib/types';

const MONITOR_STYLES: Record<MonitorStatus, { dot: string; label: string; text: string }> = {
  PENDING: { dot: 'bg-slate-400', label: 'Pending', text: 'text-slate-600 dark:text-slate-300' },
  UP: { dot: 'bg-emerald-500', label: 'Operational', text: 'text-emerald-700 dark:text-emerald-400' },
  DOWN: { dot: 'bg-red-500', label: 'Down', text: 'text-red-700 dark:text-red-400' },
  DEGRADED: { dot: 'bg-amber-500', label: 'Degraded', text: 'text-amber-700 dark:text-amber-400' },
  PAUSED: { dot: 'bg-slate-400', label: 'Paused', text: 'text-slate-500 dark:text-slate-400' },
  MAINTENANCE: { dot: 'bg-sky-500', label: 'Maintenance', text: 'text-sky-700 dark:text-sky-400' },
};

const INCIDENT_STYLES: Record<IncidentStatus, string> = {
  INVESTIGATING: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  IDENTIFIED: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  MONITORING: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  RESOLVED: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
};

const SEVERITY_STYLES: Record<Severity, string> = {
  LOW: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  MEDIUM: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  HIGH: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  CRITICAL: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
};

export function MonitorStatusBadge({ status }: { status: MonitorStatus }) {
  const s = MONITOR_STYLES[status] ?? MONITOR_STYLES.PENDING;
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${s.text}`}>
      <span className={`h-2 w-2 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

export function IncidentStatusBadge({ status }: { status: IncidentStatus }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${INCIDENT_STYLES[status]}`}>{status}</span>;
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${SEVERITY_STYLES[severity]}`}>{severity}</span>;
}

export function statusDot(status: string): string {
  const map: Record<string, string> = {
    UP: 'bg-emerald-500',
    OPERATIONAL: 'bg-emerald-500',
    DOWN: 'bg-red-500',
    DEGRADED: 'bg-amber-500',
    MAINTENANCE: 'bg-sky-500',
  };
  return map[status] ?? 'bg-slate-400';
}
