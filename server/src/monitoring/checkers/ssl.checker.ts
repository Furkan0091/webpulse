import tls from 'node:tls';
import { createHash } from 'node:crypto';
import type { Checker, CheckOutcome } from '../types.js';
import { assertSafeUrl } from '../../utils/ssrf.js';

function extractCn(subject: string | undefined): string | null {
  if (!subject) return null;
  const match = subject.match(/CN=([^,]+)/);
  return match ? match[1] : null;
}

function fingerprint(der: Buffer): string {
  return createHash('sha256').update(der).digest('hex');
}

function checkCert(target: string, timeoutMs: number): Promise<CheckOutcome> {
  return new Promise((resolve) => {
    let url: URL;
    try {
      url = new URL(target);
    } catch {
      resolve({ status: 'DOWN', error: 'Invalid URL.', errorCode: 'INVALID_URL' });
      return;
    }

    const host = url.hostname;
    const port = url.port ? Number(url.port) : 443;
    const start = process.hrtime.bigint();

    const socket = tls.connect(
      { host, port, servername: host, rejectUnauthorized: false, timeout: timeoutMs },
      () => {
        const tlsMs = Number(process.hrtime.bigint() - start) / 1e6;
        const cert = socket.getPeerCertificate(true);
        const raw = socket.getPeerCertificate(false);

        if (!raw || !raw.raw) {
          socket.destroy();
          resolve({ status: 'DOWN', error: 'No TLS certificate presented.', errorCode: 'NO_CERTIFICATE', tlsMs: Math.round(tlsMs) });
          return;
        }

        const validFrom = raw.valid_from ? new Date(raw.valid_from) : null;
        const validTo = raw.valid_to ? new Date(raw.valid_to) : null;
        const now = new Date();
        const daysRemaining = validTo ? Math.floor((validTo.getTime() - now.getTime()) / 86400000) : null;
        const expired = validTo ? validTo < now : false;

        socket.destroy();

        resolve({
          status: expired ? 'DOWN' : 'UP',
          responseTimeMs: Math.round(tlsMs),
          tlsMs: Math.round(tlsMs),
          totalMs: Math.round(tlsMs),
          error: expired ? 'SSL certificate has expired.' : undefined,
          errorCode: expired ? 'SSL_EXPIRED' : undefined,
          metadata: {
            subject: cert.subject ? extractCn(String(cert.subject.CN ?? cert.subject)) : raw.subject?.CN,
            issuer: cert.issuer?.CN ?? null,
            serialNumber: raw.serialNumber ?? null,
            fingerprint: raw.raw ? fingerprint(raw.raw) : null,
            validFrom: validFrom?.toISOString() ?? null,
            validTo: validTo?.toISOString() ?? null,
            daysRemaining,
            tlsVersion: socket.getProtocol() ?? null,
          },
        });
      },
    );

    socket.on('error', (err: NodeJS.ErrnoException) => {
      socket.destroy();
      resolve({
        status: 'DOWN',
        error: err.code === 'ETIMEDOUT' ? 'TLS handshake timed out.' : `TLS connection failed: ${err.message}`,
        errorCode: err.code ?? 'TLS_ERROR',
        totalMs: Math.round(Number(process.hrtime.bigint() - start) / 1e6),
      });
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve({ status: 'DOWN', error: 'TLS handshake timed out.', errorCode: 'TIMEOUT' });
    });
  });
}

export const sslChecker: Checker = async (monitor): Promise<CheckOutcome> => {
  await assertSafeUrl(monitor.target);
  return checkCert(monitor.target, monitor.timeoutMs);
};
