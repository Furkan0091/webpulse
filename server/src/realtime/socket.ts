import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { realtimeBus } from './events.js';
import { logger } from '../config/logger.js';
import { verifyAccessToken } from '../utils/jwt.js';
import { prisma } from '../lib/prisma.js';

export function attachSocket(server: HttpServer): Server {
  const io = new Server(server, {
    cors: { origin: '*' }, // auth enforced in handshake; fine-tune in prod
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token as string | undefined;
      if (!token) return next(new Error('Unauthorized'));
      const payload = verifyAccessToken(token);
      socket.data.userId = payload.sub;
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', async (socket) => {
    const userId = socket.data.userId as string;
    // Join a room for each org the user belongs to.
    const memberships = await prisma.organizationMember.findMany({
      where: { userId, status: 'ACTIVE' },
      select: { organizationId: true },
    });
    for (const m of memberships) {
      socket.join(`org:${m.organizationId}`);
    }
    logger.debug({ userId }, 'ws connected');
  });

  realtimeBus.on('event', (event) => {
    io.to(`org:${event.organizationId}`).emit('event', event);
  });

  return io;
}
