import { Queue } from 'bullmq';
import { queueConnection } from './connection.js';
import { QUEUES } from './names.js';

export interface MonitorCheckJob {
  monitorId: string;
  organizationId: string;
}

export interface IncidentProcessingJob {
  monitorId: string;
  organizationId: string;
  failedCheckCount: number;
  errorCode?: string;
  errorMessage?: string;
  severity: string;
}

export interface NotificationJob {
  deliveryId: string;
}

export const monitorQueue = new Queue<MonitorCheckJob>(QUEUES.MONITOR_CHECKS, {
  connection: queueConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { age: 3600, count: 1000 },
    removeOnFail: { age: 86400, count: 5000 },
  },
});

export const incidentQueue = new Queue<IncidentProcessingJob>(QUEUES.INCIDENT_PROCESSING, {
  connection: queueConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 3000 },
    removeOnComplete: { age: 3600, count: 1000 },
    removeOnFail: { age: 86400, count: 5000 },
  },
});

export const notificationQueue = new Queue<NotificationJob>(QUEUES.NOTIFICATIONS, {
  connection: queueConnection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { age: 3600, count: 5000 },
    removeOnFail: { age: 86400, count: 10000 },
  },
});

export const reportQueue = new Queue<{ slaReportId?: string }>(QUEUES.REPORT_GENERATION, {
  connection: queueConnection,
  defaultJobOptions: {
    removeOnComplete: { age: 86400, count: 1000 },
    removeOnFail: { age: 86400, count: 1000 },
  },
});
