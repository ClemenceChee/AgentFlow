/**
 * Notification channel implementations for `agentflow watch`.
 * Zero dependencies — uses Node built-in `https`/`http` for network calls.
 * @module
 */

import { request as httpsRequest } from 'node:https';
import { request as httpRequest } from 'node:http';
import { exec } from 'node:child_process';

import type { AlertPayload, NotifyChannel } from './watch-types.js';

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/** Format an alert as a human-readable plaintext message. */
export function formatAlertMessage(payload: AlertPayload): string {
  const time = new Date(payload.timestamp).toISOString();
  const arrow = `${payload.previousStatus} \u2192 ${payload.currentStatus}`;
  return [
    `[ALERT] ${payload.condition}: "${payload.agentId}"`,
    `  Status:  ${arrow}`,
    payload.detail ? `  Detail:  ${payload.detail}` : null,
    `  File:    ${payload.file}`,
    `  Time:    ${time}`,
  ].filter(Boolean).join('\n');
}

/** Format for Telegram (supports basic markdown). */
function formatTelegram(payload: AlertPayload): string {
  const icon = payload.condition === 'recovery' ? '\u2705' : '\u26a0\ufe0f';
  const time = new Date(payload.timestamp).toLocaleTimeString();
  return [
    `${icon} *AgentFlow Alert*`,
    `*${payload.condition}*: \`${payload.agentId}\``,
    `Status: ${payload.previousStatus} \u2192 ${payload.currentStatus}`,
    payload.detail ? `Detail: ${payload.detail.slice(0, 200)}` : null,
    `Time: ${time}`,
  ].filter(Boolean).join('\n');
}

// ---------------------------------------------------------------------------
// Channel senders
// ---------------------------------------------------------------------------

/** Send an alert to a single notification channel. Never throws. */
export async function sendAlert(payload: AlertPayload, channel: NotifyChannel): Promise<void> {
  try {
    switch (channel.type) {
      case 'stdout':
        sendStdout(payload);
        break;
      case 'telegram':
        await sendTelegram(payload, channel.botToken, channel.chatId);
        break;
      case 'webhook':
        await sendWebhook(payload, channel.url);
        break;
      case 'command':
        await sendCommand(payload, channel.cmd);
        break;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[agentflow] Failed to send ${channel.type} alert: ${msg}`);
  }
}

function sendStdout(payload: AlertPayload): void {
  console.log(formatAlertMessage(payload));
}

function sendTelegram(payload: AlertPayload, botToken: string, chatId: string): Promise<void> {
  const body = JSON.stringify({
    chat_id: chatId,
    text: formatTelegram(payload),
    parse_mode: 'Markdown',
  });

  return new Promise<void>((resolve, reject) => {
    const req = httpsRequest(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
      (res) => {
        res.resume(); // drain
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) resolve();
        else reject(new Error(`Telegram API returned ${res.statusCode}`));
      },
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function sendWebhook(payload: AlertPayload, url: string): Promise<void> {
  const body = JSON.stringify(payload);
  const isHttps = url.startsWith('https');
  const doRequest = isHttps ? httpsRequest : httpRequest;

  return new Promise<void>((resolve, reject) => {
    const req = doRequest(
      url,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
      (res) => {
        res.resume();
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) resolve();
        else reject(new Error(`Webhook returned ${res.statusCode}`));
      },
    );
    req.on('error', reject);
    req.setTimeout(10_000, () => { req.destroy(new Error('Webhook timeout')); });
    req.write(body);
    req.end();
  });
}

function sendCommand(payload: AlertPayload, cmd: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const env = {
      ...process.env,
      AGENTFLOW_ALERT_AGENT: payload.agentId,
      AGENTFLOW_ALERT_CONDITION: payload.condition,
      AGENTFLOW_ALERT_STATUS: payload.currentStatus,
      AGENTFLOW_ALERT_PREVIOUS_STATUS: payload.previousStatus,
      AGENTFLOW_ALERT_DETAIL: payload.detail,
      AGENTFLOW_ALERT_FILE: payload.file,
      AGENTFLOW_ALERT_TIMESTAMP: String(payload.timestamp),
    };
    exec(cmd, { env, timeout: 30_000 }, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}
