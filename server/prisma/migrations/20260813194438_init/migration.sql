-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'ADMIN', 'DEVELOPER', 'VIEWER');

-- CreateEnum
CREATE TYPE "MonitorType" AS ENUM ('HTTP', 'API', 'SSL', 'DNS', 'TCP', 'KEYWORD', 'JSON');

-- CreateEnum
CREATE TYPE "MonitorStatus" AS ENUM ('PENDING', 'UP', 'DOWN', 'DEGRADED', 'PAUSED', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "CheckStatus" AS ENUM ('UP', 'DOWN', 'DEGRADED');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('INVESTIGATING', 'IDENTIFIED', 'MONITORING', 'RESOLVED');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ChannelType" AS ENUM ('EMAIL', 'SLACK', 'DISCORD', 'TEAMS');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'FAILED', 'RETRYING');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('MONITOR_DOWN', 'MONITOR_RECOVERED', 'RESPONSE_TIME', 'SSL_EXPIRING', 'SSL_EXPIRED', 'KEYWORD_FAIL', 'ASSERTION_FAIL', 'DNS_FAIL', 'ESCALATION');

-- CreateEnum
CREATE TYPE "MaintenanceStatus" AS ENUM ('SCHEDULED', 'ACTIVE', 'COMPLETED');

-- CreateEnum
CREATE TYPE "SlaStatus" AS ENUM ('WITHIN_SLA', 'BREACHED');

-- CreateEnum
CREATE TYPE "AggregationBucket" AS ENUM ('HOURLY', 'DAILY');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "emailVerified" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logoUrl" TEXT,
    "website" TEXT,
    "industry" TEXT,
    "description" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_members" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'DEVELOPER',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "lastActiveAt" TIMESTAMP(3),
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "ip" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monitors" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "MonitorType" NOT NULL,
    "target" TEXT NOT NULL,
    "groupId" TEXT,
    "createdById" TEXT,
    "intervalSeconds" INTEGER NOT NULL DEFAULT 60,
    "timeoutMs" INTEGER NOT NULL DEFAULT 10000,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "nextCheckAt" TIMESTAMP(3),
    "status" "MonitorStatus" NOT NULL DEFAULT 'PENDING',
    "lastCheckAt" TIMESTAMP(3),
    "lastCheckId" TEXT,
    "lastResponseTimeMs" INTEGER,
    "method" TEXT NOT NULL DEFAULT 'GET',
    "headers" JSONB,
    "requestBody" JSONB,
    "auth" JSONB,
    "expectedStatus" INTEGER[] DEFAULT ARRAY[200]::INTEGER[],
    "followRedirects" BOOLEAN NOT NULL DEFAULT true,
    "responseTimeThresholdMs" INTEGER,
    "failureThreshold" INTEGER NOT NULL DEFAULT 3,
    "retries" INTEGER NOT NULL DEFAULT 1,
    "severity" "Severity" NOT NULL DEFAULT 'MEDIUM',
    "sslExpiryThresholdDays" INTEGER NOT NULL DEFAULT 30,
    "keyword" TEXT,
    "assertions" JSONB,
    "dnsRecordType" TEXT,
    "dnsExpectedValue" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "monitors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monitor_groups" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "monitor_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#6366f1',

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "check_results" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "monitorId" TEXT NOT NULL,
    "status" "CheckStatus" NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "httpStatus" INTEGER,
    "responseTimeMs" INTEGER,
    "error" TEXT,
    "errorCode" TEXT,
    "region" TEXT NOT NULL DEFAULT 'us-east-1',
    "dnsMs" INTEGER,
    "connectMs" INTEGER,
    "tlsMs" INTEGER,
    "transferMs" INTEGER,
    "totalMs" INTEGER,
    "metadata" JSONB,

    CONSTRAINT "check_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aggregated_metrics" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "monitorId" TEXT NOT NULL,
    "bucket" "AggregationBucket" NOT NULL,
    "bucketStart" TIMESTAMP(3) NOT NULL,
    "checkCount" INTEGER NOT NULL,
    "upCount" INTEGER NOT NULL,
    "downCount" INTEGER NOT NULL,
    "degradedCount" INTEGER NOT NULL,
    "uptimePct" DOUBLE PRECISION NOT NULL,
    "avgResponseTimeMs" INTEGER NOT NULL,
    "minResponseTimeMs" INTEGER NOT NULL,
    "maxResponseTimeMs" INTEGER NOT NULL,
    "p50" INTEGER NOT NULL,
    "p95" INTEGER NOT NULL,
    "p99" INTEGER NOT NULL,

    CONSTRAINT "aggregated_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incidents" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "monitorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "cause" TEXT,
    "severity" "Severity" NOT NULL,
    "status" "IncidentStatus" NOT NULL DEFAULT 'INVESTIGATING',
    "startedAt" TIMESTAMP(3) NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "durationSeconds" INTEGER,
    "errorInfo" JSONB,
    "failedCheckCount" INTEGER NOT NULL DEFAULT 0,
    "acknowledgedById" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedComment" TEXT,

    CONSTRAINT "incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_events" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incident_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_notes" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incident_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_policies" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Default',
    "monitorId" TEXT,
    "notifyImmediately" BOOLEAN NOT NULL DEFAULT true,
    "notifyAfterFailures" INTEGER NOT NULL DEFAULT 1,
    "notifyRecovery" BOOLEAN NOT NULL DEFAULT true,
    "escalationMinutes" INTEGER[] DEFAULT ARRAY[15, 30, 60]::INTEGER[],
    "severity" "Severity" NOT NULL DEFAULT 'MEDIUM',

    CONSTRAINT "alert_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_policy_channels" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,

    CONSTRAINT "alert_policy_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_channels" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ChannelType" NOT NULL,
    "config" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_deliveries" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "monitorId" TEXT NOT NULL,
    "incidentId" TEXT,
    "channelId" TEXT,
    "webhookId" TEXT,
    "channelType" TEXT NOT NULL,
    "alertType" "AlertType" NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ssl_certificates" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "monitorId" TEXT NOT NULL,
    "subject" TEXT,
    "issuer" TEXT,
    "serialNumber" TEXT,
    "fingerprint" TEXT,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "daysRemaining" INTEGER,
    "tlsVersion" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ssl_certificates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dns_records" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "monitorId" TEXT NOT NULL,
    "recordType" TEXT NOT NULL,
    "records" JSONB NOT NULL,
    "ttl" INTEGER,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dns_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "status_pages" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "logoUrl" TEXT,
    "theme" JSONB NOT NULL DEFAULT '{}',
    "customDomain" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "showUptime" BOOLEAN NOT NULL DEFAULT true,
    "showIncidents" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "status_pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "status_page_monitors" (
    "id" TEXT NOT NULL,
    "statusPageId" TEXT NOT NULL,
    "monitorId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "status_page_monitors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_windows" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" "MaintenanceStatus" NOT NULL DEFAULT 'SCHEDULED',
    "public" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "maintenance_windows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_window_monitors" (
    "id" TEXT NOT NULL,
    "maintenanceWindowId" TEXT NOT NULL,
    "monitorId" TEXT NOT NULL,

    CONSTRAINT "maintenance_window_monitors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "scopes" TEXT[],
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhooks" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "monitorId" TEXT,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "events" TEXT[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "webhooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sla_policies" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "monitorId" TEXT,
    "name" TEXT NOT NULL,
    "targetUptime" DOUBLE PRECISION NOT NULL,
    "periodDays" INTEGER NOT NULL DEFAULT 30,

    CONSTRAINT "sla_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sla_reports" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "monitorId" TEXT,
    "slaPolicyId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "targetUptime" DOUBLE PRECISION NOT NULL,
    "actualUptime" DOUBLE PRECISION NOT NULL,
    "totalTimeSeconds" INTEGER NOT NULL,
    "downtimeSeconds" INTEGER NOT NULL,
    "status" "SlaStatus" NOT NULL,
    "incidentCount" INTEGER NOT NULL,

    CONSTRAINT "sla_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "metadata" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_logs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "monitorId" TEXT,
    "userId" TEXT,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deployments" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "monitorId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "createdById" TEXT,

    CONSTRAINT "deployments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anomalies" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "monitorId" TEXT NOT NULL,
    "checkResultId" TEXT,
    "type" TEXT NOT NULL,
    "severity" "Severity" NOT NULL DEFAULT 'MEDIUM',
    "message" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "baseline" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "anomalies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_MonitorTags" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_MonitorDependencies" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "organization_members_userId_idx" ON "organization_members"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "organization_members_organizationId_userId_key" ON "organization_members"("organizationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_refreshTokenHash_key" ON "sessions"("refreshTokenHash");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "tokens_tokenHash_key" ON "tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "tokens_userId_idx" ON "tokens"("userId");

-- CreateIndex
CREATE INDEX "monitors_organizationId_type_idx" ON "monitors"("organizationId", "type");

-- CreateIndex
CREATE INDEX "monitors_organizationId_status_idx" ON "monitors"("organizationId", "status");

-- CreateIndex
CREATE INDEX "monitors_nextCheckAt_idx" ON "monitors"("nextCheckAt");

-- CreateIndex
CREATE INDEX "monitor_groups_organizationId_idx" ON "monitor_groups"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "tags_organizationId_name_key" ON "tags"("organizationId", "name");

-- CreateIndex
CREATE INDEX "check_results_monitorId_checkedAt_idx" ON "check_results"("monitorId", "checkedAt");

-- CreateIndex
CREATE INDEX "check_results_organizationId_checkedAt_idx" ON "check_results"("organizationId", "checkedAt");

-- CreateIndex
CREATE INDEX "aggregated_metrics_organizationId_bucket_bucketStart_idx" ON "aggregated_metrics"("organizationId", "bucket", "bucketStart");

-- CreateIndex
CREATE UNIQUE INDEX "aggregated_metrics_monitorId_bucket_bucketStart_key" ON "aggregated_metrics"("monitorId", "bucket", "bucketStart");

-- CreateIndex
CREATE INDEX "incidents_organizationId_status_idx" ON "incidents"("organizationId", "status");

-- CreateIndex
CREATE INDEX "incidents_monitorId_startedAt_idx" ON "incidents"("monitorId", "startedAt");

-- CreateIndex
CREATE INDEX "incident_events_incidentId_createdAt_idx" ON "incident_events"("incidentId", "createdAt");

-- CreateIndex
CREATE INDEX "incident_notes_incidentId_createdAt_idx" ON "incident_notes"("incidentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "alert_policies_monitorId_key" ON "alert_policies"("monitorId");

-- CreateIndex
CREATE INDEX "alert_policies_organizationId_idx" ON "alert_policies"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "alert_policy_channels_policyId_channelId_key" ON "alert_policy_channels"("policyId", "channelId");

-- CreateIndex
CREATE INDEX "notification_channels_organizationId_idx" ON "notification_channels"("organizationId");

-- CreateIndex
CREATE INDEX "notification_deliveries_organizationId_createdAt_idx" ON "notification_deliveries"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "notification_deliveries_dedupeKey_idx" ON "notification_deliveries"("dedupeKey");

-- CreateIndex
CREATE INDEX "notification_deliveries_status_idx" ON "notification_deliveries"("status");

-- CreateIndex
CREATE INDEX "ssl_certificates_monitorId_checkedAt_idx" ON "ssl_certificates"("monitorId", "checkedAt");

-- CreateIndex
CREATE INDEX "dns_records_monitorId_checkedAt_idx" ON "dns_records"("monitorId", "checkedAt");

-- CreateIndex
CREATE UNIQUE INDEX "status_pages_slug_key" ON "status_pages"("slug");

-- CreateIndex
CREATE INDEX "status_pages_organizationId_idx" ON "status_pages"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "status_page_monitors_statusPageId_monitorId_key" ON "status_page_monitors"("statusPageId", "monitorId");

-- CreateIndex
CREATE INDEX "maintenance_windows_organizationId_startsAt_idx" ON "maintenance_windows"("organizationId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "maintenance_window_monitors_maintenanceWindowId_monitorId_key" ON "maintenance_window_monitors"("maintenanceWindowId", "monitorId");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_keyHash_key" ON "api_keys"("keyHash");

-- CreateIndex
CREATE INDEX "api_keys_organizationId_idx" ON "api_keys"("organizationId");

-- CreateIndex
CREATE INDEX "webhooks_organizationId_idx" ON "webhooks"("organizationId");

-- CreateIndex
CREATE INDEX "sla_policies_organizationId_idx" ON "sla_policies"("organizationId");

-- CreateIndex
CREATE INDEX "sla_reports_organizationId_periodStart_idx" ON "sla_reports"("organizationId", "periodStart");

-- CreateIndex
CREATE INDEX "audit_logs_organizationId_createdAt_idx" ON "audit_logs"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "activity_logs_organizationId_createdAt_idx" ON "activity_logs"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "activity_logs_monitorId_createdAt_idx" ON "activity_logs"("monitorId", "createdAt");

-- CreateIndex
CREATE INDEX "deployments_organizationId_startedAt_idx" ON "deployments"("organizationId", "startedAt");

-- CreateIndex
CREATE INDEX "anomalies_monitorId_createdAt_idx" ON "anomalies"("monitorId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "_MonitorTags_AB_unique" ON "_MonitorTags"("A", "B");

-- CreateIndex
CREATE INDEX "_MonitorTags_B_index" ON "_MonitorTags"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_MonitorDependencies_AB_unique" ON "_MonitorDependencies"("A", "B");

-- CreateIndex
CREATE INDEX "_MonitorDependencies_B_index" ON "_MonitorDependencies"("B");

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monitors" ADD CONSTRAINT "monitors_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "monitor_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monitors" ADD CONSTRAINT "monitors_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monitor_groups" ADD CONSTRAINT "monitor_groups_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monitor_groups" ADD CONSTRAINT "monitor_groups_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "monitor_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tags" ADD CONSTRAINT "tags_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_results" ADD CONSTRAINT "check_results_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_results" ADD CONSTRAINT "check_results_monitorId_fkey" FOREIGN KEY ("monitorId") REFERENCES "monitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aggregated_metrics" ADD CONSTRAINT "aggregated_metrics_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aggregated_metrics" ADD CONSTRAINT "aggregated_metrics_monitorId_fkey" FOREIGN KEY ("monitorId") REFERENCES "monitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_monitorId_fkey" FOREIGN KEY ("monitorId") REFERENCES "monitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_acknowledgedById_fkey" FOREIGN KEY ("acknowledgedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_events" ADD CONSTRAINT "incident_events_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_notes" ADD CONSTRAINT "incident_notes_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_notes" ADD CONSTRAINT "incident_notes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_policies" ADD CONSTRAINT "alert_policies_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_policies" ADD CONSTRAINT "alert_policies_monitorId_fkey" FOREIGN KEY ("monitorId") REFERENCES "monitors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_policy_channels" ADD CONSTRAINT "alert_policy_channels_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "alert_policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_policy_channels" ADD CONSTRAINT "alert_policy_channels_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "notification_channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_channels" ADD CONSTRAINT "notification_channels_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_monitorId_fkey" FOREIGN KEY ("monitorId") REFERENCES "monitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "notification_channels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "webhooks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ssl_certificates" ADD CONSTRAINT "ssl_certificates_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ssl_certificates" ADD CONSTRAINT "ssl_certificates_monitorId_fkey" FOREIGN KEY ("monitorId") REFERENCES "monitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dns_records" ADD CONSTRAINT "dns_records_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dns_records" ADD CONSTRAINT "dns_records_monitorId_fkey" FOREIGN KEY ("monitorId") REFERENCES "monitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "status_pages" ADD CONSTRAINT "status_pages_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "status_page_monitors" ADD CONSTRAINT "status_page_monitors_statusPageId_fkey" FOREIGN KEY ("statusPageId") REFERENCES "status_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "status_page_monitors" ADD CONSTRAINT "status_page_monitors_monitorId_fkey" FOREIGN KEY ("monitorId") REFERENCES "monitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_windows" ADD CONSTRAINT "maintenance_windows_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_window_monitors" ADD CONSTRAINT "maintenance_window_monitors_maintenanceWindowId_fkey" FOREIGN KEY ("maintenanceWindowId") REFERENCES "maintenance_windows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_window_monitors" ADD CONSTRAINT "maintenance_window_monitors_monitorId_fkey" FOREIGN KEY ("monitorId") REFERENCES "monitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_monitorId_fkey" FOREIGN KEY ("monitorId") REFERENCES "monitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sla_policies" ADD CONSTRAINT "sla_policies_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sla_policies" ADD CONSTRAINT "sla_policies_monitorId_fkey" FOREIGN KEY ("monitorId") REFERENCES "monitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sla_reports" ADD CONSTRAINT "sla_reports_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sla_reports" ADD CONSTRAINT "sla_reports_monitorId_fkey" FOREIGN KEY ("monitorId") REFERENCES "monitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sla_reports" ADD CONSTRAINT "sla_reports_slaPolicyId_fkey" FOREIGN KEY ("slaPolicyId") REFERENCES "sla_policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_monitorId_fkey" FOREIGN KEY ("monitorId") REFERENCES "monitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_monitorId_fkey" FOREIGN KEY ("monitorId") REFERENCES "monitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anomalies" ADD CONSTRAINT "anomalies_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anomalies" ADD CONSTRAINT "anomalies_monitorId_fkey" FOREIGN KEY ("monitorId") REFERENCES "monitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anomalies" ADD CONSTRAINT "anomalies_checkResultId_fkey" FOREIGN KEY ("checkResultId") REFERENCES "check_results"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_MonitorTags" ADD CONSTRAINT "_MonitorTags_A_fkey" FOREIGN KEY ("A") REFERENCES "monitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_MonitorTags" ADD CONSTRAINT "_MonitorTags_B_fkey" FOREIGN KEY ("B") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_MonitorDependencies" ADD CONSTRAINT "_MonitorDependencies_A_fkey" FOREIGN KEY ("A") REFERENCES "monitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_MonitorDependencies" ADD CONSTRAINT "_MonitorDependencies_B_fkey" FOREIGN KEY ("B") REFERENCES "monitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
