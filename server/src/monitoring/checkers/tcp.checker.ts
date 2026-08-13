import net from 'node:net';
import type { Checker, CheckOutcome } from '../types.js';

export const tcpChecker: Checker = async (monitor): Promise<CheckOutcome> => {
  const [host, portStr] = monitor.target.split(':');
  const port = Number(portStr);
  if (!host || !port || Number.isNaN(port)) {
    return { status: 'DOWN', error: 'Invalid TCP target (expected host:port).', errorCode: 'INVALID_TARGET' };
  }

  return new Promise((resolve) => {
    const start = process.hrtime.bigint();
    const socket = net.connect({ host, port, timeout: monitor.timeoutMs });

    socket.on('connect', () => {
      const ms = Math.round(Number(process.hrtime.bigint() - start) / 1e6);
      socket.destroy();
      resolve({ status: 'UP', responseTimeMs: ms, totalMs: ms, connectMs: ms });
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve({ status: 'DOWN', error: 'TCP connection timed out.', errorCode: 'TIMEOUT' });
    });

    socket.on('error', (err: NodeJS.ErrnoException) => {
      socket.destroy();
      resolve({
        status: 'DOWN',
        error: `TCP connection failed: ${err.code ?? err.message}`,
        errorCode: err.code ?? 'TCP_ERROR',
      });
    });
  });
};
