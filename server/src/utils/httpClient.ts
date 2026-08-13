import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import { promisify } from 'node:util';
import { AppError } from '../lib/errors.js';
import { assertSafeUrl } from './ssrf.js';

const dnsLookup = promisify(dns.lookup);

export interface HttpTiming {
  dnsMs: number | null;
  connectMs: number | null;
  tlsMs: number | null;
  ttfbMs: number | null;
  totalMs: number;
}

export interface HttpResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  finalUrl: string;
  redirects: number;
  timing: HttpTiming;
}

export interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  maxRedirects?: number;
  followRedirects?: boolean;
  maxBytes?: number;
}

const MAX_BYTES = 512 * 1024;

function requestOnce(target: URL, options: RequestOptions): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const isHttps = target.protocol === 'https:';
    const mod = isHttps ? https : http;
    const start = process.hrtime.bigint();
    const timing: HttpTiming = { dnsMs: null, connectMs: null, tlsMs: null, ttfbMs: null, totalMs: 0 };
    let dnsStart = 0n;
    let connectStart = 0n;
    let dnsDone = false;
    let connected = false;

    const headers: Record<string, string> = {
      'User-Agent': 'WebPulse-Monitor/1.0',
      Accept: '*/*',
      ...(options.headers ?? {}),
    };
    if (options.body != null && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    const req = mod.request(
      target,
      {
        method: options.method ?? 'GET',
        headers,
        timeout: options.timeoutMs ?? 10000,
      },
      (res) => {
        const ttfb = Number(process.hrtime.bigint() - start) / 1e6;
        timing.ttfbMs = Math.round(ttfb);

        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (chunk: Buffer) => {
          if (size < MAX_BYTES) {
            chunks.push(chunk);
            size += chunk.length;
          }
        });
        res.on('end', () => {
          const total = Number(process.hrtime.bigint() - start) / 1e6;
          timing.totalMs = Math.round(total);
          const resultHeaders: Record<string, string> = {};
          for (const [k, v] of Object.entries(res.headers)) {
            if (typeof v === 'string') resultHeaders[k] = v;
            else if (Array.isArray(v)) resultHeaders[k] = v.join(', ');
          }
          resolve({
            status: res.statusCode ?? 0,
            statusText: res.statusMessage ?? '',
            headers: resultHeaders,
            body: Buffer.concat(chunks).toString('utf8').slice(0, MAX_BYTES),
            finalUrl: target.toString(),
            redirects: 0,
            timing,
          });
        });
        res.on('error', reject);
      },
    );

    // Phase timing hooks.
    req.on('socket', (socket) => {
      socket.on('lookup', () => {
        dnsDone = true;
        timing.dnsMs = Math.round(Number(process.hrtime.bigint() - dnsStart) / 1e6);
      });
      socket.on('connect', () => {
        connected = true;
        timing.connectMs = Math.round(Number(process.hrtime.bigint() - (dnsDone ? dnsStart : start)) / 1e6);
      });
      socket.on('secureConnect', () => {
        timing.tlsMs = Math.round(Number(process.hrtime.bigint() - connectStart) / 1e6);
      });
    });

    req.on('timeout', () => {
      req.destroy(new AppError('BAD_REQUEST', 'Request timed out.'));
    });
    req.on('error', reject);

    // Pre-resolve DNS to measure it explicitly (also re-checks SSRF).
    dnsStart = process.hrtime.bigint();
    connectStart = dnsStart;

    if (options.body != null) {
      req.write(options.body);
    }
    req.end();
  });
}

export async function request(target: string, options: RequestOptions = {}): Promise<HttpResponse> {
  const maxRedirects = options.maxRedirects ?? 5;
  const followRedirects = options.followRedirects ?? true;

  let url: URL;
  try {
    url = new URL(target);
  } catch {
    throw new AppError('VALIDATION_ERROR', 'Invalid target URL.');
  }
  await assertSafeUrl(url.toString());

  let current = url;
  let redirects = 0;

  for (;;) {
    const res = await requestOnce(current, {
      ...options,
      // Re-resolve SSRF safety on every hop.
    });
    res.redirects = redirects;

    const isRedirect = res.status >= 300 && res.status < 400 && res.headers.location;
    if (!isRedirect || !followRedirects) return res;

    if (redirects >= maxRedirects) {
      throw new AppError('BAD_REQUEST', 'Too many redirects.');
    }

    const next = new URL(res.headers.location, current);
    // Critical: re-validate redirect target against SSRF rules.
    await assertSafeUrl(next.toString());
    current = next;
    redirects += 1;
  }
}

/** Convenience wrapper returning only what the checkers need. */
export async function httpGet(target: string, options: RequestOptions = {}): Promise<HttpResponse> {
  return request(target, { ...options, method: options.method ?? 'GET' });
}
