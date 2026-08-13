import { z } from 'zod';

const authConfigSchema = z.object({
  type: z.enum(['none', 'basic', 'bearer', 'apiKey']).default('none'),
  username: z.string().optional(),
  password: z.string().optional(),
  token: z.string().optional(),
  apiKeyHeader: z.string().optional(),
  apiKeyValue: z.string().optional(),
});

const assertionsSchema = z
  .array(
    z.object({
      field: z.string().min(1), // dot path e.g. "data.user.active"
      operator: z.enum(['equals', 'not_equals', 'exists', 'not_exists', 'contains', 'gt', 'lt']).default('equals'),
      expected: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
    }),
  )
  .optional();

export const createMonitorSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['HTTP', 'API', 'SSL', 'DNS', 'TCP', 'KEYWORD', 'JSON']),
  target: z.string().min(1).max(2000),
  groupId: z.string().uuid().optional(),
  intervalSeconds: z.number().int().min(30).max(3600).default(60),
  timeoutMs: z.number().int().min(1000).max(60000).default(10000),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']).default('GET'),
  headers: z.record(z.string(), z.string()).optional(),
  requestBody: z.object({ content: z.string(), contentType: z.string().default('application/json') }).optional(),
  auth: authConfigSchema.optional(),
  expectedStatus: z.array(z.number().int().min(100).max(599)).default([200]),
  followRedirects: z.boolean().default(true),
  responseTimeThresholdMs: z.number().int().min(1).optional(),
  failureThreshold: z.number().int().min(1).max(10).default(3),
  retries: z.number().int().min(0).max(5).default(1),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
  sslExpiryThresholdDays: z.number().int().min(1).max(90).default(30),
  keyword: z.string().max(500).optional(),
  assertions: assertionsSchema,
  dnsRecordType: z.enum(['A', 'AAAA', 'CNAME', 'MX', 'TXT']).optional(),
  dnsExpectedValue: z.string().optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  dependencyIds: z.array(z.string().uuid()).max(20).optional(),
  alertPolicyId: z.string().uuid().optional(),
});

export const updateMonitorSchema = createMonitorSchema.partial();

export const listMonitorsQuery = z.object({
  status: z.enum(['PENDING', 'UP', 'DOWN', 'DEGRADED', 'PAUSED', 'MAINTENANCE']).optional(),
  type: z.enum(['HTTP', 'API', 'SSL', 'DNS', 'TCP', 'KEYWORD', 'JSON']).optional(),
  tag: z.string().optional(),
  groupId: z.string().uuid().optional(),
  search: z.string().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const checksQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum(['UP', 'DOWN', 'DEGRADED']).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
