import { sendMail } from '../services/mail.service.js';
import { hmacSign } from '../utils/crypto.js';
import { logger } from '../config/logger.js';
import { env } from '../config/env.js';

export interface AlertPayload {
  event: string;
  alertType: string;
  organizationId: string;
  monitor: { id: string; name: string; type: string; target: string };
  incidentId?: string;
  incidentTitle?: string;
  severity?: string;
  message: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

async function postJson(url: string, body: unknown, headers: Record<string, string> = {}): Promise<void> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} from ${url}`);
  }
}

export async function sendEmail(to: string, subject: string, text: string): Promise<void> {
  await sendMail({ to, subject, text });
}

export async function sendSlack(webhookUrl: string, payload: AlertPayload): Promise<void> {
  const color = payload.alertType.includes('RECOVER') ? '#22c55e' : '#ef4444';
  await postJson(webhookUrl, {
    attachments: [
      {
        color,
        fallback: `${payload.monitor.name}: ${payload.message}`,
        title: `WebPulse: ${payload.monitor.name} — ${payload.message}`,
        fields: [
          { title: 'Event', value: payload.event, short: true },
          { title: 'Severity', value: payload.severity ?? '—', short: true },
        ],
        ts: Math.floor(new Date(payload.timestamp).getTime() / 1000),
      },
    ],
  });
}

export async function sendDiscord(webhookUrl: string, payload: AlertPayload): Promise<void> {
  const color = payload.alertType.includes('RECOVER') ? 0x22c55e : 0xef4444;
  await postJson(webhookUrl, {
    embeds: [
      {
        title: `WebPulse: ${payload.monitor.name}`,
        description: payload.message,
        color,
        fields: [
          { name: 'Event', value: payload.event, inline: true },
          { name: 'Severity', value: payload.severity ?? '—', inline: true },
        ],
        timestamp: payload.timestamp,
      },
    ],
  });
}

export async function sendTeams(webhookUrl: string, payload: AlertPayload): Promise<void> {
  await postJson(webhookUrl, {
    '@type': 'MessageCard',
    '@context': 'http://schema.org/extensions',
    summary: `WebPulse: ${payload.monitor.name} — ${payload.message}`,
    themeColor: payload.alertType.includes('RECOVER') ? '22c55e' : 'ef4444',
    title: `WebPulse: ${payload.monitor.name}`,
    text: payload.message,
    sections: [
      {
        facts: [
          { name: 'Event', value: payload.event },
          { name: 'Severity', value: payload.severity ?? '—' },
        ],
      },
    ],
  });
}

export async function sendWebhook(url: string, secret: string, payload: AlertPayload): Promise<void> {
  const body = JSON.stringify(payload);
  const signature = hmacSign(secret, body);
  await postJson(url, payload, {
    'X-WebPulse-Signature': `sha256=${signature}`,
    'X-WebPulse-Event': payload.event,
  });
}

export type ChannelConfig = {
  type: string;
  config: Record<string, unknown>;
  to?: string;
  name?: string;
};

export async function dispatchChannel(channel: ChannelConfig, payload: AlertPayload): Promise<void> {
  const cfg = channel.config ?? {};
  switch (channel.type) {
    case 'EMAIL': {
      const to = (cfg.email as string) || channel.to;
      if (!to) throw new Error('No recipient email configured.');
      await sendEmail(to, `WebPulse Alert: ${payload.monitor.name} — ${payload.message}`, buildEmailText(payload));
      break;
    }
    case 'SLACK':
      if (!cfg.webhookUrl) throw new Error('No Slack webhook URL configured.');
      await sendSlack(cfg.webhookUrl as string, payload);
      break;
    case 'DISCORD':
      if (!cfg.webhookUrl) throw new Error('No Discord webhook URL configured.');
      await sendDiscord(cfg.webhookUrl as string, payload);
      break;
    case 'TEAMS':
      if (!cfg.webhookUrl) throw new Error('No Teams webhook URL configured.');
      await sendTeams(cfg.webhookUrl as string, payload);
      break;
    case 'WEBHOOK':
      if (!cfg.url) throw new Error('No webhook URL configured.');
      await sendWebhook(cfg.url as string, (cfg.secret as string) ?? '', payload);
      break;
    default:
      throw new Error(`Unsupported channel type: ${channel.type}`);
  }
}

function buildEmailText(payload: AlertPayload): string {
  return [
    `WebPulse Alert`,
    `Monitor: ${payload.monitor.name}`,
    `Event: ${payload.event}`,
    `Status: ${payload.message}`,
    `Time: ${payload.timestamp}`,
    payload.incidentId ? `Incident: ${payload.incidentId}` : '',
    '',
    `${env.webBaseUrl}`,
  ]
    .filter(Boolean)
    .join('\n');
}

export function logDispatch(payload: AlertPayload): void {
  logger.info({ event: payload.event, monitor: payload.monitor.name }, 'alert dispatched');
}
