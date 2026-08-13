import http from 'node:http';
import { createApp } from './app.js';
import { attachSocket } from './realtime/socket.js';
import { startMonitorWorker } from './workers/monitorWorker.js';
import { startNotificationWorker } from './workers/notificationWorker.js';
import { startScheduler } from './workers/scheduler.js';
import { startHousekeeping } from './workers/housekeeping.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';

const app = createApp();
const server = http.createServer(app);
attachSocket(server);

// Single-process mode: run the scheduler and workers alongside the API.
// For horizontal scaling, run `npm run worker` in a separate process and set
// START_WORKERS=false here.
if (env.nodeEnv !== 'production' || process.env.START_WORKERS !== 'false') {
  logger.info('starting scheduler + workers in-process');
  startScheduler();
  startMonitorWorker();
  startNotificationWorker();
  startHousekeeping();
}

server.listen(env.port, () => {
  logger.info(`WebPulse API listening on http://localhost:${env.port}`);
  logger.info(`API docs: http://localhost:${env.port}/api/docs`);
});
