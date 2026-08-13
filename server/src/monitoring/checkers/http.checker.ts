import type { Monitor } from '@prisma/client';
import type { Checker, CheckOutcome } from '../types.js';
import { request } from '../../utils/httpClient.js';
import { evaluateAssertions, type AssertionRule } from '../../utils/assert.js';

interface AuthConfig {
  type?: 'none' | 'basic' | 'bearer' | 'apiKey';
  username?: string;
  password?: string;
  token?: string;
  apiKeyHeader?: string;
  apiKeyValue?: string;
}

interface RequestBodyConfig {
  content?: string;
  contentType?: string;
}

function buildHeaders(monitor: Monitor): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: '*/*',
    ...((monitor.headers as Record<string, string> | null) ?? {}),
  };

  const auth = (monitor.auth ?? {}) as AuthConfig;
  switch (auth.type) {
    case 'basic':
      if (auth.username) {
        const cred = Buffer.from(`${auth.username}:${auth.password ?? ''}`).toString('base64');
        headers.Authorization = `Basic ${cred}`;
      }
      break;
    case 'bearer':
      if (auth.token) headers.Authorization = `Bearer ${auth.token}`;
      break;
    case 'apiKey':
      if (auth.apiKeyHeader && auth.apiKeyValue) headers[auth.apiKeyHeader] = auth.apiKeyValue;
      break;
  }

  return headers;
}

export const httpChecker: Checker = async (monitor): Promise<CheckOutcome> => {
  const headers = buildHeaders(monitor);
  const bodyConfig = (monitor.requestBody ?? {}) as RequestBodyConfig;
  const expectedStatus = monitor.expectedStatus.length ? monitor.expectedStatus : [200];

  const res = await request(monitor.target, {
    method: monitor.method,
    headers,
    body: bodyConfig.content,
    timeoutMs: monitor.timeoutMs,
    followRedirects: monitor.followRedirects,
  });

  const outcome: CheckOutcome = {
    status: 'UP',
    httpStatus: res.status,
    responseTimeMs: res.timing.totalMs,
    dnsMs: res.timing.dnsMs,
    connectMs: res.timing.connectMs,
    tlsMs: res.timing.tlsMs,
    totalMs: res.timing.totalMs,
    metadata: {
      finalUrl: res.finalUrl,
      statusText: res.statusText,
      redirects: res.redirects,
      contentType: res.headers['content-type'] ?? null,
    },
  };

  // 1. Status code validation
  if (!expectedStatus.includes(res.status)) {
    outcome.status = 'DOWN';
    outcome.error = `Expected status ${expectedStatus.join(',')} but received ${res.status}.`;
    outcome.errorCode = 'STATUS_MISMATCH';
    return outcome;
  }

  // 2. Keyword check
  if (monitor.type === 'KEYWORD' && monitor.keyword) {
    const found = res.body.includes(monitor.keyword);
    outcome.metadata = { ...outcome.metadata, keywordFound: found };
    if (!found) {
      outcome.status = 'DOWN';
      outcome.error = `Expected keyword "${monitor.keyword}" was not found in the response.`;
      outcome.errorCode = 'KEYWORD_MISMATCH';
      return outcome;
    }
  }

  // 3. JSON assertions
  if ((monitor.type === 'JSON' || monitor.type === 'API') && monitor.assertions) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(res.body);
    } catch {
      outcome.status = 'DOWN';
      outcome.error = 'Response body is not valid JSON.';
      outcome.errorCode = 'INVALID_JSON';
      return outcome;
    }
    const result = evaluateAssertions(parsed, (monitor.assertions as unknown as AssertionRule[]) ?? []);
    outcome.metadata = { ...outcome.metadata, assertionFailures: result.failures };
    if (!result.pass) {
      outcome.status = 'DOWN';
      outcome.error = result.failures.join('; ');
      outcome.errorCode = 'ASSERTION_FAIL';
      return outcome;
    }
  }

  // 4. Response-time threshold (degraded, not down)
  if (monitor.responseTimeThresholdMs && res.timing.totalMs > monitor.responseTimeThresholdMs) {
    outcome.status = 'DEGRADED';
    outcome.error = `Response time ${res.timing.totalMs}ms exceeded threshold ${monitor.responseTimeThresholdMs}ms.`;
    outcome.errorCode = 'RESPONSE_TIME';
  }

  return outcome;
};
