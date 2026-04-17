/**
 * Authentication and authorization types.
 */

/** Business user roles for RBAC */
export type UserRole = 'executive' | 'manager' | 'analyst' | 'viewer' | 'admin';

/** Permissions mapped to business domains */
export type Permission =
  | 'read:performance'
  | 'read:financial'
  | 'read:compliance'
  | 'read:decisions'
  | 'write:decisions'
  | 'read:anomalies'
  | 'read:dashboards'
  | 'write:dashboards'
  | 'read:integrations'
  | 'write:integrations'
  | 'admin:users'
  | 'admin:system';

/** Authenticated user context */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  permissions: Permission[];
  scopes: string[];
}

/** OAuth 2.0 token payload */
export interface TokenPayload {
  sub: string;
  email: string;
  name: string;
  role: UserRole;
  scope: string;
  iat: number;
  exp: number;
  iss: string;
}

/** Role → Permissions mapping */
export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  executive: [
    'read:performance', 'read:financial', 'read:compliance',
    'read:decisions', 'read:anomalies', 'read:dashboards',
  ],
  manager: [
    'read:performance', 'read:financial', 'read:compliance',
    'read:decisions', 'write:decisions', 'read:anomalies',
    'read:dashboards', 'write:dashboards',
  ],
  analyst: [
    'read:performance', 'read:financial', 'read:compliance',
    'read:decisions', 'read:anomalies', 'read:dashboards',
    'write:dashboards',
  ],
  viewer: [
    'read:performance', 'read:compliance', 'read:dashboards',
  ],
  admin: [
    'read:performance', 'read:financial', 'read:compliance',
    'read:decisions', 'write:decisions', 'read:anomalies',
    'read:dashboards', 'write:dashboards', 'read:integrations',
    'write:integrations', 'admin:users', 'admin:system',
  ],
};
