/**
 * Role-based access control (RBAC) middleware and utilities.
 */

import type { Middleware, RouteContext } from '../api/router.js';
import { sendJson } from '../api/router.js';
import type { AuthUser, Permission, UserRole } from './types.js';
import { ROLE_PERMISSIONS } from './types.js';

/**
 * Middleware: require authentication. Populates ctx.userId and ctx.userRole.
 */
export function requireAuth(verifyFn: (token: string) => Promise<AuthUser>): Middleware {
  return async (ctx: RouteContext, next: () => Promise<void>): Promise<void> => {
    const authHeader = ctx.req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      sendJson(ctx.res, 401, {
        error: 'Unauthorized',
        message: 'Missing or invalid Authorization header. Provide a Bearer token.',
      });
      return;
    }

    const token = authHeader.slice(7);
    try {
      const user = await verifyFn(token);
      ctx.userId = user.id;
      ctx.userRole = user.role;
      // Attach full user to request for downstream handlers
      (ctx as RouteContext & { user: AuthUser }).user = user;
      await next();
    } catch (err) {
      sendJson(ctx.res, 401, {
        error: 'Unauthorized',
        message: err instanceof Error ? err.message : 'Invalid token',
      });
    }
  };
}

/**
 * Middleware: require specific permission(s).
 * Must be used after requireAuth.
 */
export function requirePermission(...required: Permission[]): Middleware {
  return async (ctx: RouteContext, next: () => Promise<void>): Promise<void> => {
    const user = (ctx as RouteContext & { user?: AuthUser }).user;
    if (!user) {
      sendJson(ctx.res, 401, {
        error: 'Unauthorized',
        message: 'Authentication required.',
      });
      return;
    }

    const hasAll = required.every((p) => user.permissions.includes(p));
    if (!hasAll) {
      sendJson(ctx.res, 403, {
        error: 'Forbidden',
        message: `Insufficient permissions. Required: ${required.join(', ')}`,
      });
      return;
    }

    await next();
  };
}

/**
 * Middleware: require specific role(s).
 */
export function requireRole(...roles: UserRole[]): Middleware {
  return async (ctx: RouteContext, next: () => Promise<void>): Promise<void> => {
    const user = (ctx as RouteContext & { user?: AuthUser }).user;
    if (!user) {
      sendJson(ctx.res, 401, { error: 'Unauthorized', message: 'Authentication required.' });
      return;
    }

    if (!roles.includes(user.role)) {
      sendJson(ctx.res, 403, {
        error: 'Forbidden',
        message: `Access restricted to roles: ${roles.join(', ')}`,
      });
      return;
    }

    await next();
  };
}

/**
 * Check if a role has a specific permission.
 */
export function roleHasPermission(role: UserRole, permission: Permission): boolean {
  return (ROLE_PERMISSIONS[role] ?? []).includes(permission);
}
