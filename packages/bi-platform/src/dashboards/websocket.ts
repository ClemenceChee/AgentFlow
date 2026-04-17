/**
 * WebSocket manager for real-time dashboard updates.
 *
 * Tasks: 6.4 (responsive/mobile — data layer), 6.6 (WebSocket updates), 6.10 (sharing)
 */

import type { Server } from 'node:http';
import type { Logger } from '../monitoring/logger.js';

export interface WsClient {
  id: string;
  userId?: string;
  subscriptions: Set<string>;
  send(data: unknown): void;
}

export interface DashboardUpdate {
  channel: string;
  type: 'kpi_update' | 'anomaly_alert' | 'data_refresh' | 'notification';
  payload: unknown;
  timestamp: string;
}

/**
 * Lightweight WebSocket-like broadcast manager.
 * Uses Server-Sent Events (SSE) for simplicity — no ws dependency needed.
 */
export class RealtimeManager {
  private clients = new Map<string, WsClient>();
  private clientIdCounter = 0;

  constructor(private logger: Logger) {}

  /** Register a new SSE client connection. */
  addClient(userId?: string): WsClient {
    const id = `client-${++this.clientIdCounter}`;
    const client: WsClient = {
      id,
      userId,
      subscriptions: new Set(['global']),
      send: () => {}, // Will be set by the SSE handler
    };
    this.clients.set(id, client);
    this.logger.info('Client connected', { clientId: id, userId });
    return client;
  }

  /** Remove a client connection. */
  removeClient(clientId: string): void {
    this.clients.delete(clientId);
    this.logger.info('Client disconnected', { clientId });
  }

  /** Subscribe a client to a channel. */
  subscribe(clientId: string, channel: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      client.subscriptions.add(channel);
    }
  }

  /** Broadcast an update to subscribed clients. */
  broadcast(update: DashboardUpdate): void {
    const { channel } = update;
    let sent = 0;

    for (const client of this.clients.values()) {
      if (client.subscriptions.has(channel) || client.subscriptions.has('global')) {
        try {
          client.send(update);
          sent++;
        } catch {
          // Client may have disconnected
          this.clients.delete(client.id);
        }
      }
    }

    this.logger.debug('Broadcast sent', { channel, type: update.type, recipients: sent });
  }

  /** Broadcast a KPI update to all dashboard clients. */
  broadcastKpiUpdate(kpis: unknown): void {
    this.broadcast({
      channel: 'dashboard',
      type: 'kpi_update',
      payload: kpis,
      timestamp: new Date().toISOString(),
    });
  }

  /** Broadcast an anomaly alert. */
  broadcastAnomalyAlert(anomaly: unknown): void {
    this.broadcast({
      channel: 'alerts',
      type: 'anomaly_alert',
      payload: anomaly,
      timestamp: new Date().toISOString(),
    });
  }

  /** Get connected client count. */
  getClientCount(): number {
    return this.clients.size;
  }

  /** Get client by ID. */
  getClient(clientId: string): WsClient | undefined {
    return this.clients.get(clientId);
  }
}
