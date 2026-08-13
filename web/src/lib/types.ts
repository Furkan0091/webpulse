export type MonitorStatus = 'PENDING' | 'UP' | 'DOWN' | 'DEGRADED' | 'PAUSED' | 'MAINTENANCE';
export type MonitorType = 'HTTP' | 'API' | 'SSL' | 'DNS' | 'TCP' | 'KEYWORD' | 'JSON';
export type IncidentStatus = 'INVESTIGATING' | 'IDENTIFIED' | 'MONITORING' | 'RESOLVED';
export type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface User {
  id: string;
  email: string;
  name: string;
  emailVerified: string | null;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  role?: string;
}

export interface Monitor {
  id: string;
  name: string;
  type: MonitorType;
  target: string;
  status: MonitorStatus;
  intervalSeconds: number;
  timeoutMs: number;
  lastCheckAt: string | null;
  lastResponseTimeMs: number | null;
  uptimePct?: number;
  tags?: { id: string; name: string; color: string }[];
  group?: { id: string; name: string } | null;
  sslCertificates?: { daysRemaining: number | null; validTo: string | null }[];
}

export interface Incident {
  id: string;
  title: string;
  status: IncidentStatus;
  severity: Severity;
  startedAt: string;
  detectedAt: string;
  resolvedAt: string | null;
  durationSeconds: number | null;
  cause: string | null;
  failedCheckCount: number;
  monitor: { id: string; name: string; type: string; target: string };
}

export interface IncidentEvent {
  id: string;
  type: string;
  message: string;
  createdAt: string;
}

export interface IncidentDetail extends Incident {
  events: IncidentEvent[];
  notes: { id: string; content: string; createdAt: string; user: { name: string; email: string } }[];
  acknowledgedBy: { id: string; name: string } | null;
  acknowledgedAt: string | null;
}

export interface Dashboard {
  uptime: { pct: number; avgResponseTimeMs: number | null; range: string };
  monitors: {
    total: number;
    operational: number;
    degraded: number;
    down: number;
    paused: number;
    maintenance: number;
    pending: number;
  };
  activeIncidents: number;
  attentionMonitors: Monitor[];
  recentActivity: { id: string; type: string; message: string; createdAt: string; monitor: { name: string } | null }[];
  recentIncidents: Incident[];
}

export interface Analytics {
  range: string;
  uptimePct: number;
  totalChecks: number;
  upChecks: number;
  downChecks: number;
  degradedChecks: number;
  responseTime: { avg: number | null; min: number | null; max: number | null; p50: number | null; p95: number | null; p99: number | null };
  series: { ts: string; avgResponseTimeMs: number | null; uptimePct: number | null; checks: number }[];
}

export interface CheckResult {
  id: string;
  status: 'UP' | 'DOWN' | 'DEGRADED';
  checkedAt: string;
  httpStatus: number | null;
  responseTimeMs: number | null;
  error: string | null;
  errorCode: string | null;
  region: string;
  dnsMs: number | null;
  connectMs: number | null;
  tlsMs: number | null;
  totalMs: number | null;
}

export interface PublicStatus {
  name: string;
  description: string | null;
  overall: string;
  monitors: { id: string; name: string; type: string; status: string; lastResponseTimeMs: number | null }[];
  activeIncidents: { id: string; title: string; status: string; severity: string; startedAt: string; monitor: { name: string } }[];
  maintenance: { title: string; description: string | null; startsAt: string; endsAt: string }[];
}
