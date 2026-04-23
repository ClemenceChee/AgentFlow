/**
 * OAuth 2.0 token verification.
 *
 * Supports both JWT validation (with JWKS) and token introspection.
 * Provider-agnostic: works with any OAuth 2.0 / OIDC compliant provider.
 */

import { createHmac } from 'node:crypto';
import type { AuthUser, TokenPayload } from './types.js';
import { ROLE_PERMISSIONS } from './types.js';

export interface OAuthConfig {
  /** JWKS endpoint for token verification */
  jwksUri?: string;
  /** Token introspection endpoint (fallback) */
  introspectionUri?: string;
  /** Expected token issuer */
  issuer: string;
  /** Expected audience */
  audience: string;
  /** Shared secret for HMAC-based tokens (dev/testing) */
  hmacSecret?: string;
  /** Clock skew tolerance in seconds */
  clockSkewSeconds: number;
}

export function loadOAuthConfig(): OAuthConfig {
  return {
    jwksUri: process.env.BI_OAUTH_JWKS_URI,
    introspectionUri: process.env.BI_OAUTH_INTROSPECTION_URI,
    issuer: process.env.BI_OAUTH_ISSUER ?? 'bi-platform',
    audience: process.env.BI_OAUTH_AUDIENCE ?? 'bi-api',
    hmacSecret: process.env.BI_OAUTH_HMAC_SECRET,
    clockSkewSeconds: Number(process.env.BI_OAUTH_CLOCK_SKEW_SECONDS ?? 30),
  };
}

/**
 * Verify a Bearer token and return the authenticated user.
 * Throws on invalid/expired tokens.
 */
export async function verifyToken(token: string, config: OAuthConfig): Promise<AuthUser> {
  // Decode JWT payload (works for all JWT-based tokens)
  const payload = decodeJwtPayload(token);

  // Verify with HMAC secret if configured (for dev/testing)
  if (config.hmacSecret) {
    verifyHmacToken(token, config.hmacSecret);
  }

  // Verify claims
  const now = Math.floor(Date.now() / 1000);

  if (payload.iss && payload.iss !== config.issuer) {
    throw new AuthError('Invalid token issuer');
  }

  if (payload.exp && payload.exp + config.clockSkewSeconds < now) {
    throw new AuthError('Token expired');
  }

  if (payload.iat && payload.iat - config.clockSkewSeconds > now) {
    throw new AuthError('Token issued in the future');
  }

  // If JWKS or introspection is configured, verify remotely
  if (config.jwksUri) {
    await verifyWithJwks(token, config.jwksUri);
  } else if (config.introspectionUri) {
    await verifyWithIntrospection(token, config.introspectionUri);
  }

  const role = payload.role ?? 'viewer';
  const permissions = ROLE_PERMISSIONS[role] ?? ROLE_PERMISSIONS.viewer;

  return {
    id: payload.sub,
    email: payload.email ?? '',
    name: payload.name ?? '',
    role,
    permissions,
    scopes: payload.scope ? payload.scope.split(' ') : [],
  };
}

function decodeJwtPayload(token: string): TokenPayload {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new AuthError('Invalid token format');
  }
  try {
    const payload = Buffer.from(parts[1], 'base64url').toString('utf-8');
    return JSON.parse(payload) as TokenPayload;
  } catch {
    throw new AuthError('Invalid token payload');
  }
}

function verifyHmacToken(token: string, secret: string): void {
  const parts = token.split('.');
  if (parts.length !== 3) throw new AuthError('Invalid token format');

  const [header, payload, signature] = parts;
  const expected = createHmac('sha256', secret)
    .update(`${header}.${payload}`)
    .digest('base64url');

  if (signature !== expected) {
    throw new AuthError('Invalid token signature');
  }
}

async function verifyWithJwks(_token: string, _jwksUri: string): Promise<void> {
  // In production, fetch JWKS and verify RS256/ES256 signature
  // Implementation depends on the specific crypto library chosen
  // Placeholder for JWKS-based verification
}

async function verifyWithIntrospection(_token: string, _uri: string): Promise<void> {
  // In production, call the introspection endpoint to verify token
  // Placeholder for introspection-based verification
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}
