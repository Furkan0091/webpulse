import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

const smtpTransport =
  env.smtp.host && env.smtp.user
    ? nodemailer.createTransport({
        host: env.smtp.host,
        port: env.smtp.port,
        secure: env.smtp.secure,
        auth: { user: env.smtp.user, pass: env.smtp.pass },
      })
    : null;

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/** Send via the Resend API. Returns true if delivered, false if not configured. */
async function sendViaResend(message: MailMessage): Promise<boolean> {
  if (!env.resend.apiKey) return false;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.resend.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.resend.from,
      to: [message.to],
      subject: message.subject,
      text: message.text,
      ...(message.html ? { html: message.html } : {}),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Resend returned ${res.status}: ${body.slice(0, 300)}`);
  }
  return true;
}

/**
 * Delivery priority: Resend API → SMTP → dev log. Never throws — a failed
 * notification must not crash the API or worker.
 */
export async function sendMail(message: MailMessage): Promise<void> {
  try {
    if (await sendViaResend(message)) return;
  } catch (err) {
    logger.error({ err, to: message.to }, 'failed to send email via Resend');
    // Fall through to SMTP if configured.
  }

  if (smtpTransport) {
    try {
      await smtpTransport.sendMail({
        from: env.smtp.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
      return;
    } catch (err) {
      logger.error({ err, to: message.to }, 'failed to send email via SMTP');
      return;
    }
  }

  // Dev mode: no provider configured — log the email instead of silently dropping.
  logger.info({ to: message.to, subject: message.subject }, 'email (dev log, not sent)');
}
