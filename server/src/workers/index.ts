import { logger } from '../config/logger.js';
import { startMonitorWorker } from './monitorWorker.js';
import { startNotificationWorker } from './notificationWorker.js';
import { startScheduler } from './scheduler.js';
import { startHousekeeping } from './housekeeping.js';

// Standalone worker process (`npm run worker`). Used to scale out processing
// independently from the API server.
logger.info('starting WebPulse workers');

const monitorWorker = startMonitorWorker();
const notificationWorker = startNotificationWorker();
startScheduler();
startHousekeeping();

process.on('SIGTERM', async () => {
  logger.info('shutting down workers');
  await monitorWorker.close();
  await notificationWorker.close();
  process.exit(0);
});
