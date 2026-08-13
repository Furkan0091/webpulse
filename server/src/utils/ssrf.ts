import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';
import { AppError } from '../lib/errors.js';

// IPv4 ranges that must never be reachable by the monitoring engine.
const BLOCKED_V4 = [
  [0x00000000, 0x00ffffff], // 0.0.0.0/8
  [0x0a000000, 0x0affffff], // 10.0.0.0/8
  [0x64400000, 0x647fffff], // 100.64.0.0/10 (CGNAT)
  [0x7f000000, 0x7fffffff], // 127.0.0.0/8
  [0xa9fe0000, 0xa9feffff], // 169.254.0.0/16 (link-local + cloud metadata)
  [0xac100000, 0xac1fffff], // 172.16.0.0/12
  [0xc0000000, 0xc00000ff], // 192.0.0.0/24
  [0xc0000200, 0xc00002ff], // 192.0.2.0/24 (TEST-NET)
  [0xc0a80000, 0xc0a8ffff], // 192.168.0.0/16
  [0xc6120000, 0xc613ffff], // 198.18.0.0/15
  [0xc6336400, 0xc63364ff], // 198.51.100.0/24
  [0xcb007100, 0xcb0071ff], // 203.0.113.0/24
  [0xe0000000, 0xefffffff], // 224.0.0.0/4 (multicast)
  [0xf0000000, 0xffffffff], // 240.0.0.0/4 (reserved)
];

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata.google.internal',
  'metadata.google.com',
]);

function ipv4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, octet) => (acc << 8) | Number(octet), 0) >>> 0;
}

function isBlockedIpv4(ip: string): boolean {
  const value = ipv4ToInt(ip);
  return BLOCKED_V4.some(([start, end]) => value >= start && value <= end);
}

function isBlockedIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === '::' || normalized === '::1') return true;
  // fc00::/7 — unique local addresses
  if (/^f[cd][0-9a-f]{2}:/.test(normalized)) return true;
  // fe80::/10 — link local
  if (/^fe[89ab][0-9a-f]:/.test(normalized)) return true;
  // IPv4-mapped private addresses ::ffff:10.0.0.1 etc.
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isBlockedIpv4(mapped[1]);
  return false;
}

export function isBlockedIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isBlockedIpv4(ip);
  if (version === 6) return isBlockedIpv6(ip);
  return true; // not a valid IP => treat as blocked
}

/**
 * Resolves a hostname and rejects it if any resolved address points at a
 * private / loopback / link-local / metadata address.
 */
export async function assertSafeHost(hostname: string): Promise<void> {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (BLOCKED_HOSTNAMES.has(host) || host.endsWith('.local')) {
    throw new AppError('SSRF_BLOCKED', 'Target hostname is not allowed.');
  }

  // Fast path: literal IP (no DNS needed).
  if (isIP(host)) {
    if (isBlockedIp(host)) {
      throw new AppError('SSRF_BLOCKED', 'Target resolves to a private or reserved address.');
    }
    return;
  }

  let addresses: string[];
  try {
    addresses = (await lookup(host, { all: true })).map((a) => a.address);
  } catch {
    throw new AppError('BAD_REQUEST', `Could not resolve hostname: ${host}`);
  }

  if (addresses.length === 0) {
    throw new AppError('BAD_REQUEST', `Could not resolve hostname: ${host}`);
  }

  for (const addr of addresses) {
    if (isBlockedIp(addr)) {
      throw new AppError('SSRF_BLOCKED', 'Target resolves to a private or reserved address.');
    }
  }
}

/**
 * Validates a URL is http(s) and safe to request. Returns a parsed URL.
 * Used both at monitor-creation time (best effort) and at check time.
 */
export async function assertSafeUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new AppError('VALIDATION_ERROR', 'Invalid target URL.');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new AppError('VALIDATION_ERROR', 'Only http and https targets are supported.');
  }

  await assertSafeHost(url.hostname);
  return url;
}
