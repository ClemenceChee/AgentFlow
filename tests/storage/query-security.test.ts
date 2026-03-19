/**
 * Security tests for SQL ORDER BY allowlist in query builder.
 */

import Database from 'better-sqlite3';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { QueryBuilder } from '../../packages/storage/src/query.js';

describe('QueryBuilder ORDER BY allowlist', () => {
  let db: Database.Database;
  let qb: QueryBuilder;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE executions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agentId TEXT NOT NULL,
        trigger TEXT NOT NULL,
        name TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        success INTEGER NOT NULL DEFAULT 1,
        executionTime INTEGER,
        nodeCount INTEGER,
        failureCount INTEGER DEFAULT 0,
        metadata TEXT,
        traceData TEXT,
        filename TEXT,
        createdAt INTEGER
      )
    `);
    db.exec(`
      INSERT INTO executions (agentId, trigger, name, timestamp, success, executionTime)
      VALUES ('agent-a', 'test', 'run1', 1000, 1, 100),
             ('agent-b', 'test', 'run2', 2000, 1, 200)
    `);
    qb = new QueryBuilder(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should accept valid orderBy and orderDirection', () => {
    const results = qb.findExecutions({ orderBy: 'executionTime', orderDirection: 'ASC' });
    expect(results).toHaveLength(2);
    expect(results[0].executionTime).toBe(100);
    expect(results[1].executionTime).toBe(200);
  });

  it('should fall back to defaults for injection payload in orderBy', () => {
    // This should not throw or execute injected SQL
    const results = qb.findExecutions({
      orderBy: 'timestamp; DROP TABLE executions; --' as any,
      orderDirection: 'DESC',
    });
    expect(results).toHaveLength(2);
    // Table should still exist
    const count = db.prepare('SELECT count(*) as c FROM executions').get() as any;
    expect(count.c).toBe(2);
  });

  it('should fall back to defaults for invalid orderDirection', () => {
    const results = qb.findExecutions({
      orderDirection: 'DESC; --' as any,
    });
    expect(results).toHaveLength(2);
  });
});
