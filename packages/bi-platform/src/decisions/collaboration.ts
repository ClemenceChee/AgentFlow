/**
 * Collaborative decision support workflows.
 *
 * Tasks: 5.6 (collaborative workflows), 5.7 (notifications),
 *        5.9 (consensus tracking), 5.10 (task assignment)
 */

import type { DbPool } from '../db/pool.js';
import type { Logger } from '../monitoring/logger.js';

export interface DecisionWorkflow {
  id: string;
  title: string;
  description: string;
  decisionType: 'strategic' | 'operational' | 'tactical';
  status: 'draft' | 'review' | 'voting' | 'decided' | 'implemented';
  stakeholders: Stakeholder[];
  votes: Vote[];
  tasks: TaskAssignment[];
  createdBy: string;
  createdAt: string;
  decidedAt?: string;
}

export interface Stakeholder {
  userId: string;
  role: string;
  notified: boolean;
  notifiedAt?: string;
}

export interface Vote {
  userId: string;
  vote: 'approve' | 'reject' | 'abstain';
  comment?: string;
  votedAt: string;
}

export interface TaskAssignment {
  id: string;
  title: string;
  assignee: string;
  status: 'pending' | 'in_progress' | 'completed';
  dueDate?: string;
}

export interface NotificationPayload {
  type: 'decision_review' | 'vote_request' | 'decision_outcome' | 'task_assigned' | 'critical_alert';
  recipientId: string;
  title: string;
  message: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  actionUrl?: string;
  metadata?: Record<string, unknown>;
}

export class CollaborationService {
  private pendingNotifications: NotificationPayload[] = [];

  constructor(
    private db: DbPool,
    private logger: Logger,
  ) {}

  /** Create a new decision workflow. */
  async createWorkflow(
    title: string,
    description: string,
    decisionType: DecisionWorkflow['decisionType'],
    stakeholderIds: string[],
    createdBy: string,
  ): Promise<string> {
    const { rows } = await this.db.query<{ id: string }>(
      `INSERT INTO business_decisions
        (decision_type, title, description, status, stakeholders, created_by)
       VALUES ($1, $2, $3, 'pending', $4, $5)
       RETURNING id`,
      [decisionType, title, description, stakeholderIds, createdBy],
    );

    const id = rows[0].id;

    // Queue notifications for stakeholders
    for (const stakeholderId of stakeholderIds) {
      this.queueNotification({
        type: 'decision_review',
        recipientId: stakeholderId,
        title: `Decision Review: ${title}`,
        message: description,
        severity: decisionType === 'strategic' ? 'high' : 'medium',
      });
    }

    this.logger.info('Decision workflow created', { id, title, stakeholders: stakeholderIds.length });
    return id;
  }

  /** Record a vote on a decision. */
  async recordVote(
    decisionId: string,
    userId: string,
    vote: Vote['vote'],
    comment?: string,
  ): Promise<void> {
    // Store vote in recommendation JSONB
    const { rows } = await this.db.query<{ recommendation: string }>(
      `SELECT recommendation FROM business_decisions WHERE id = $1`,
      [decisionId],
    );

    if (rows.length === 0) throw new Error(`Decision not found: ${decisionId}`);

    const existing = rows[0].recommendation ? JSON.parse(rows[0].recommendation as string) : {};
    const votes: Vote[] = existing.votes ?? [];
    votes.push({ userId, vote, comment, votedAt: new Date().toISOString() });

    await this.db.query(
      `UPDATE business_decisions SET recommendation = $1, decided_at = NOW() WHERE id = $2`,
      [JSON.stringify({ ...existing, votes }), decisionId],
    );

    this.logger.info('Vote recorded', { decisionId, userId, vote });
  }

  /** Get consensus status for a decision. */
  async getConsensus(decisionId: string): Promise<{
    totalVotes: number;
    approvals: number;
    rejections: number;
    abstentions: number;
    consensusReached: boolean;
    consensusThreshold: number;
  }> {
    const { rows } = await this.db.query<{ recommendation: string; stakeholders: string[] }>(
      `SELECT recommendation, stakeholders FROM business_decisions WHERE id = $1`,
      [decisionId],
    );

    if (rows.length === 0) throw new Error(`Decision not found: ${decisionId}`);

    const data = rows[0].recommendation ? JSON.parse(rows[0].recommendation as string) : {};
    const votes: Vote[] = data.votes ?? [];
    const stakeholderCount = (rows[0].stakeholders ?? []).length;

    const approvals = votes.filter((v) => v.vote === 'approve').length;
    const rejections = votes.filter((v) => v.vote === 'reject').length;
    const abstentions = votes.filter((v) => v.vote === 'abstain').length;
    const threshold = Math.ceil(stakeholderCount * 0.5); // Simple majority

    return {
      totalVotes: votes.length,
      approvals,
      rejections,
      abstentions,
      consensusReached: approvals >= threshold,
      consensusThreshold: threshold,
    };
  }

  /** Queue a notification (to be sent by notification service). */
  queueNotification(notification: NotificationPayload): void {
    this.pendingNotifications.push(notification);
    this.logger.info('Notification queued', {
      type: notification.type,
      recipient: notification.recipientId,
      severity: notification.severity,
    });
  }

  /** Get and clear pending notifications. */
  drainNotifications(): NotificationPayload[] {
    const notifications = [...this.pendingNotifications];
    this.pendingNotifications = [];
    return notifications;
  }
}
