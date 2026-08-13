import { PrismaClient, type CheckStatus, type MonitorStatus } from '@prisma/client';
import { hashPassword } from '../src/utils/password.js';
import { sha256 } from '../src/utils/crypto.js';

const prisma = new PrismaClient();

const DEMO_EMAIL = 'furqan@vertex.systems';
const DEMO_PASSWORD = 'webpulse-demo-123';
const ORG_SLUG = 'vertex-systems';

function minutesAgo(min: number): Date {
  return new Date(Date.now() - min * 60 * 1000);
}

function randBetween(min: number, max: number): number {
  return Math.round(min + Math.random() * (max - min));
}

async function main() {
  console.log('Seeding WebPulse demo data…');

  // Reset any previous demo data for a clean, deterministic demo.
  const existingOrg = await prisma.organization.findUnique({ where: { slug: ORG_SLUG } });
  if (existingOrg) {
    await prisma.organization.delete({ where: { id: existingOrg.id } });
    console.log('  removed previous demo organization');
  }
  const existingUser = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
  if (existingUser) await prisma.user.delete({ where: { id: existingUser.id } });

  // ── User + org ───────────────────────────────────────────
  const user = await prisma.user.create({
    data: {
      email: DEMO_EMAIL,
      name: 'Furqan Ahmed',
      passwordHash: await hashPassword(DEMO_PASSWORD),
      emailVerified: new Date(),
    },
  });

  const org = await prisma.organization.create({
    data: {
      name: 'Vertex Systems',
      slug: ORG_SLUG,
      website: 'https://vertex.systems',
      industry: 'SaaS / Fintech',
      description: 'Demo organization for WebPulse.',
      timezone: 'UTC',
    },
  });

  await prisma.organizationMember.create({
    data: { organizationId: org.id, userId: user.id, role: 'OWNER', lastActiveAt: new Date() },
  });

  // ── Groups ───────────────────────────────────────────────
  const prodGroup = await prisma.monitorGroup.create({ data: { organizationId: org.id, name: 'Production' } });
  const stagingGroup = await prisma.monitorGroup.create({ data: { organizationId: org.id, name: 'Staging' } });

  // ── Tags ─────────────────────────────────────────────────
  const tagCritical = await prisma.tag.create({ data: { organizationId: org.id, name: 'critical', color: '#ef4444' } });
  const tagBackend = await prisma.tag.create({ data: { organizationId: org.id, name: 'backend', color: '#6366f1' } });
  const tagCustomer = await prisma.tag.create({ data: { organizationId: org.id, name: 'customer-facing', color: '#22c55e' } });

  // ── Channels + policy ────────────────────────────────────
  const emailChannel = await prisma.notificationChannel.create({
    data: { organizationId: org.id, name: 'Ops Email', type: 'EMAIL', config: { email: DEMO_EMAIL } },
  });
  const slackChannel = await prisma.notificationChannel.create({
    data: { organizationId: org.id, name: '#incidents Slack', type: 'SLACK', config: { webhookUrl: 'https://hooks.slack.com/services/demo/invalid/placeholder' } },
  });

  const defaultPolicy = await prisma.alertPolicy.create({
    data: {
      organizationId: org.id,
      name: 'Default',
      notifyImmediately: true,
      notifyAfterFailures: 1,
      notifyRecovery: true,
      escalationMinutes: [15, 30, 60],
      severity: 'MEDIUM',
    },
  });
  await prisma.alertPolicyChannel.createMany({
    data: [
      { policyId: defaultPolicy.id, channelId: emailChannel.id },
      { policyId: defaultPolicy.id, channelId: slackChannel.id },
    ],
  });

  // A stricter, monitor-specific policy for the payments API.
  const criticalPolicy = await prisma.alertPolicy.create({
    data: {
      organizationId: org.id,
      name: 'Critical — Payments',
      notifyImmediately: true,
      notifyAfterFailures: 1,
      notifyRecovery: true,
      escalationMinutes: [5, 15, 30],
      severity: 'CRITICAL',
    },
  });
  await prisma.alertPolicyChannel.createMany({
    data: [
      { policyId: criticalPolicy.id, channelId: emailChannel.id },
      { policyId: criticalPolicy.id, channelId: slackChannel.id },
    ],
  });

  // ── Monitors ─────────────────────────────────────────────
  const monitorSpecs = [
    {
      name: 'Production Website', type: 'HTTP', target: 'https://example.com',
      group: prodGroup, tags: [tagCustomer], status: 'UP', base: 150, interval: 60, severity: 'HIGH' as const,
    },
    {
      name: 'Production API', type: 'API', target: 'https://jsonplaceholder.typicode.com/todos/1',
      group: prodGroup, tags: [tagBackend, tagCritical], status: 'UP', base: 220, interval: 30, severity: 'CRITICAL' as const,
    },
    {
      name: 'Payment API', type: 'HTTP', target: 'https://httpbin.org/delay/1',
      group: prodGroup, tags: [tagBackend, tagCritical], status: 'DEGRADED', base: 1050, interval: 30, severity: 'HIGH' as const,
    },
    {
      name: 'Authentication Service', type: 'HTTP', target: 'https://example.com',
      group: prodGroup, tags: [tagBackend], status: 'UP', base: 130, interval: 60, severity: 'CRITICAL' as const,
    },
    {
      name: 'Staging Environment', type: 'HTTP', target: 'https://example.com',
      group: stagingGroup, tags: [], status: 'MAINTENANCE', base: 160, interval: 300, severity: 'LOW' as const,
    },
    {
      name: 'SSL — example.com', type: 'SSL', target: 'https://example.com',
      group: prodGroup, tags: [tagCustomer], status: 'UP', base: 90, interval: 3600, severity: 'MEDIUM' as const,
    },
    {
      name: 'DNS — example.com', type: 'DNS', target: 'example.com',
      group: prodGroup, tags: [], status: 'UP', base: 40, interval: 300, severity: 'MEDIUM' as const,
    },
  ];

  const monitors = [];
  for (const spec of monitorSpecs) {
    const m = await prisma.monitor.create({
      data: {
        organizationId: org.id,
        name: spec.name,
        type: spec.type as never,
        target: spec.target,
        groupId: spec.group.id,
        intervalSeconds: spec.interval,
        timeoutMs: 10000,
        status: spec.status as MonitorStatus,
        severity: spec.severity,
        expectedStatus: [200],
        failureThreshold: 3,
        retries: 1,
        responseTimeThresholdMs: spec.name === 'Payment API' ? 500 : null,
        sslExpiryThresholdDays: 30,
        createdById: user.id,
        lastCheckAt: new Date(),
        lastResponseTimeMs: spec.base + randBetween(-20, 20),
        nextCheckAt: new Date(), // due immediately → scheduler picks up on boot
        dnsRecordType: spec.type === 'DNS' ? 'A' : null,
        tags: spec.tags.length ? { connect: spec.tags.map((t) => ({ id: t.id })) } : undefined,
      },
    });
    monitors.push({ monitor: m, spec });
  }

  const [website, api, payment, auth, staging, ssl, dns] = monitors;

  // Payment API uses the stricter critical policy; others use the org default.
  await prisma.monitor.update({ where: { id: payment.monitor.id }, data: { alertPolicyId: criticalPolicy.id } });

  // ── Check history (5-minute resolution, last 24h) ────────
  const checks: any[] = [];
  const now = Date.now();
  const POINTS = 288; // 24h at 5-min resolution
  for (let i = POINTS; i >= 0; i--) {
    const ts = new Date(now - i * 5 * 60 * 1000);
    for (const { monitor, spec } of monitors) {
      // Payment API had a degraded window ~2h ago.
      let status: CheckStatus = 'UP';
      let rt = spec.base + randBetween(-15, 25);
      if (monitor.name === 'Payment API') {
        const minsAgo = (now - ts.getTime()) / 60000;
        if (minsAgo > 90 && minsAgo < 150) {
          status = randBetween(0, 4) === 0 ? 'DOWN' : 'DEGRADED';
          rt = randBetween(1800, 3200);
        }
      }
      if (monitor.name === 'Staging Environment') {
        // Maintenance window — paused-ish; few checks.
        if (i % 6 !== 0) continue;
        status = 'UP';
      }
      checks.push({
        organizationId: org.id,
        monitorId: monitor.id,
        status,
        checkedAt: ts,
        httpStatus: status === 'UP' || status === 'DEGRADED' ? 200 : 503,
        responseTimeMs: status === 'DOWN' ? null : rt,
        error: status === 'DOWN' ? 'Connection timed out' : status === 'DEGRADED' ? 'Response time exceeded threshold' : null,
        errorCode: status === 'DOWN' ? 'TIMEOUT' : status === 'DEGRADED' ? 'RESPONSE_TIME' : null,
        region: 'us-east-1',
        totalMs: rt,
        dnsMs: randBetween(5, 25),
        connectMs: randBetween(10, 40),
        tlsMs: randBetween(20, 45),
      });
    }
  }

  // Bulk insert in chunks.
  for (let i = 0; i < checks.length; i += 1000) {
    await prisma.checkResult.createMany({ data: checks.slice(i, i + 1000) });
  }
  console.log(`  seeded ${checks.length} check results`);

  // ── Resolved incident (Payment API degraded) ─────────────
  const startedAt = minutesAgo(150);
  const resolvedAt = minutesAgo(92);
  const incident = await prisma.incident.create({
    data: {
      organizationId: org.id,
      monitorId: payment.monitor.id,
      title: 'Payment API degraded performance',
      cause: 'Elevated response times following a deployment.',
      severity: 'HIGH',
      status: 'RESOLVED',
      startedAt,
      detectedAt: minutesAgo(147),
      resolvedAt,
      durationSeconds: Math.round((resolvedAt.getTime() - startedAt.getTime()) / 1000),
      failedCheckCount: 5,
      public: true,
    },
  });

  const timeline = [
    ['FAILED_CHECK', 'Response time exceeded threshold.', 146],
    ['FAILED_CHECK', 'Multiple failed checks detected.', 144],
    ['INCIDENT_CREATED', 'Incident created after 3 failed check(s).', 143],
    ['ALERT_SENT', 'Alert sent (MONITOR_DOWN) via 2 channel(s).', 143],
    ['ACKNOWLEDGED', 'Incident acknowledged by Furqan Ahmed', 140],
    ['RECOVERED', 'Service recovered — monitoring before resolution', 96],
    ['RESOLVED', 'Incident resolved', 92],
  ] as const;
  for (const [type, message, min] of timeline) {
    await prisma.incidentEvent.create({
      data: { incidentId: incident.id, type, message, createdAt: minutesAgo(min) },
    });
  }
  await prisma.incidentNote.create({
    data: { incidentId: incident.id, userId: user.id, content: 'Investigating recent deployment. Rolled back to v2.3.', createdAt: minutesAgo(138) },
  });

  // ── SSL certificate snapshot ─────────────────────────────
  await prisma.sslCertificate.create({
    data: {
      organizationId: org.id,
      monitorId: ssl.monitor.id,
      subject: 'vertex.systems',
      issuer: "Let's Encrypt R3",
      serialNumber: '04a1b2c3d4e5f6a7',
      fingerprint: sha256('demo-cert'),
      validFrom: minutesAgo(-50 * 24 * 60),
      validTo: minutesAgo(39 * 24 * 60),
      daysRemaining: 39,
      tlsVersion: 'TLSv1.3',
    },
  });

  // ── Maintenance window (staging) ─────────────────────────
  await prisma.maintenanceWindow.create({
    data: {
      organizationId: org.id,
      title: 'Staging database migration',
      description: 'Scheduled maintenance for the staging environment.',
      startsAt: minutesAgo(60),
      endsAt: minutesAgo(-120),
      status: 'ACTIVE',
      public: true,
      monitors: { create: { monitorId: staging.monitor.id } },
    },
  });

  // ── Status page ──────────────────────────────────────────
  const statusPage = await prisma.statusPage.create({
    data: {
      organizationId: org.id,
      slug: 'vertex-status',
      name: 'Vertex Systems Status',
      description: 'Live status for Vertex Systems production services.',
      published: true,
      showUptime: true,
      showIncidents: true,
      theme: { accent: '#6366f1' },
    },
  });
  await prisma.statusPageMonitor.createMany({
    data: [website, api, auth, payment].map((m, i) => ({ statusPageId: statusPage.id, monitorId: m.monitor.id, position: i })),
  });

  // ── SLA policy ───────────────────────────────────────────
  const sla = await prisma.slaPolicy.create({
    data: { organizationId: org.id, monitorId: api.monitor.id, name: 'API 99.9% monthly', targetUptime: 99.9, periodDays: 30 },
  });
  await prisma.slaReport.create({
    data: {
      organizationId: org.id,
      monitorId: api.monitor.id,
      slaPolicyId: sla.id,
      periodStart: minutesAgo(30 * 24 * 60),
      periodEnd: new Date(),
      targetUptime: 99.9,
      actualUptime: 99.96,
      totalTimeSeconds: 30 * 24 * 3600,
      downtimeSeconds: 1037,
      status: 'WITHIN_SLA',
      incidentCount: 1,
    },
  });

  // ── API key (hashed) ─────────────────────────────────────
  await prisma.apiKey.create({
    data: {
      organizationId: org.id,
      createdById: user.id,
      name: 'Demo CI key',
      prefix: 'wp_live_demo00',
      keyHash: sha256('wp_live_demo-do-not-use-in-prod'),
      scopes: ['monitors:read', 'incidents:read', 'status:read'],
    },
  });

  // ── Activity / audit logs ────────────────────────────────
  await prisma.activityLog.createMany({
    data: [
      { organizationId: org.id, monitorId: payment.monitor.id, userId: user.id, type: 'INCIDENT_RESOLVED', message: 'Incident resolved after 58m', createdAt: minutesAgo(92) },
      { organizationId: org.id, monitorId: api.monitor.id, userId: user.id, type: 'MONITOR_UPDATED', message: 'Monitor configuration updated', createdAt: minutesAgo(60 * 5) },
      { organizationId: org.id, monitorId: website.monitor.id, userId: user.id, type: 'MONITOR_CREATED', message: 'Monitor "Production Website" created', createdAt: minutesAgo(60 * 24 * 3) },
    ],
  });

  console.log('');
  console.log('Demo ready. Log in with:');
  console.log(`  email:    ${DEMO_EMAIL}`);
  console.log(`  password: ${DEMO_PASSWORD}`);
  console.log(`Status page: http://localhost:5173/status/vertex-status`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
