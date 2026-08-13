import dns from 'node:dns';
import type { Checker, CheckOutcome } from '../types.js';

// Use `dns.lookup` (getaddrinfo / OS resolver) for A/AAAA so resolution works
// even when no upstream DNS server is directly reachable (c-ares). For record
// types that getaddrinfo cannot answer (MX/TXT/CNAME) fall back to c-ares.
async function resolveRecords(recordType: string, host: string): Promise<string[]> {
  switch (recordType) {
    case 'A': {
      const { address } = await dns.promises.lookup(host, { family: 4 });
      return [address];
    }
    case 'AAAA': {
      const { address } = await dns.promises.lookup(host, { family: 6 });
      return [address];
    }
    case 'CNAME':
      return dns.promises.resolveCname(host);
    case 'MX': {
      const records = await dns.promises.resolveMx(host);
      return records.map((r) => `${r.exchange} (priority ${r.priority})`);
    }
    case 'TXT': {
      const records = await dns.promises.resolveTxt(host);
      return records.map((r) => r.join(''));
    }
    default:
      return dns.promises.resolve4(host);
  }
}

export const dnsChecker: Checker = async (monitor): Promise<CheckOutcome> => {
  const recordType = monitor.dnsRecordType ?? 'A';
  const start = process.hrtime.bigint();

  try {
    const values = await resolveRecords(recordType, monitor.target);
    const ms = Math.round(Number(process.hrtime.bigint() - start) / 1e6);

    const expected = monitor.dnsExpectedValue;
    const matches = !expected || values.some((v) => v === expected || v.includes(expected));

    return {
      status: matches ? 'UP' : 'DOWN',
      responseTimeMs: ms,
      totalMs: ms,
      error: matches ? undefined : `Expected record "${expected}" not found.`,
      errorCode: matches ? undefined : 'DNS_MISMATCH',
      metadata: { recordType, records: values, ttl: null },
    };
  } catch (err) {
    const ms = Math.round(Number(process.hrtime.bigint() - start) / 1e6);
    const code = (err as NodeJS.ErrnoException).code ?? 'DNS_ERROR';
    return {
      status: 'DOWN',
      responseTimeMs: ms,
      totalMs: ms,
      error: `DNS resolution failed: ${code}`,
      errorCode: code,
      metadata: { recordType },
    };
  }
};
