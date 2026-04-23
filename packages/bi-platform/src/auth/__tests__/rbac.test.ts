import { describe, expect, it } from 'vitest';
import { roleHasPermission } from '../rbac.js';

describe('RBAC', () => {
  it('admin has all permissions', () => {
    expect(roleHasPermission('admin', 'read:performance')).toBe(true);
    expect(roleHasPermission('admin', 'write:integrations')).toBe(true);
    expect(roleHasPermission('admin', 'admin:system')).toBe(true);
  });

  it('viewer has limited permissions', () => {
    expect(roleHasPermission('viewer', 'read:performance')).toBe(true);
    expect(roleHasPermission('viewer', 'read:compliance')).toBe(true);
    expect(roleHasPermission('viewer', 'read:dashboards')).toBe(true);
    expect(roleHasPermission('viewer', 'read:financial')).toBe(false);
    expect(roleHasPermission('viewer', 'write:dashboards')).toBe(false);
    expect(roleHasPermission('viewer', 'admin:system')).toBe(false);
  });

  it('executive has read-only access', () => {
    expect(roleHasPermission('executive', 'read:performance')).toBe(true);
    expect(roleHasPermission('executive', 'read:financial')).toBe(true);
    expect(roleHasPermission('executive', 'read:compliance')).toBe(true);
    expect(roleHasPermission('executive', 'write:dashboards')).toBe(false);
    expect(roleHasPermission('executive', 'admin:system')).toBe(false);
  });

  it('manager can write decisions', () => {
    expect(roleHasPermission('manager', 'write:decisions')).toBe(true);
    expect(roleHasPermission('manager', 'write:dashboards')).toBe(true);
    expect(roleHasPermission('manager', 'admin:system')).toBe(false);
  });

  it('analyst has financial read but no write', () => {
    expect(roleHasPermission('analyst', 'read:financial')).toBe(true);
    expect(roleHasPermission('analyst', 'write:dashboards')).toBe(true);
    expect(roleHasPermission('analyst', 'write:integrations')).toBe(false);
  });
});
