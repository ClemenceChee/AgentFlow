/**
 * Lightweight HTTP router for the BI API gateway.
 * No framework dependency — built on Node http module.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS';

export interface RouteContext {
  req: IncomingMessage;
  res: ServerResponse;
  params: Record<string, string>;
  query: Record<string, string>;
  body: unknown;
  userId?: string;
  userRole?: string;
}

export type RouteHandler = (ctx: RouteContext) => Promise<void> | void;
export type Middleware = (ctx: RouteContext, next: () => Promise<void>) => Promise<void>;

interface Route {
  method: HttpMethod;
  pattern: RegExp;
  paramNames: string[];
  handler: RouteHandler;
}

export class Router {
  private routes: Route[] = [];
  private middlewares: Middleware[] = [];

  use(middleware: Middleware): void {
    this.middlewares.push(middleware);
  }

  get(path: string, handler: RouteHandler): void {
    this.addRoute('GET', path, handler);
  }

  post(path: string, handler: RouteHandler): void {
    this.addRoute('POST', path, handler);
  }

  put(path: string, handler: RouteHandler): void {
    this.addRoute('PUT', path, handler);
  }

  delete(path: string, handler: RouteHandler): void {
    this.addRoute('DELETE', path, handler);
  }

  private addRoute(method: HttpMethod, path: string, handler: RouteHandler): void {
    const paramNames: string[] = [];
    const pattern = new RegExp(
      '^' +
        path.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, name) => {
          paramNames.push(name);
          return '([^/]+)';
        }) +
        '$',
    );
    this.routes.push({ method, pattern, paramNames, handler });
  }

  async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const method = (req.method ?? 'GET').toUpperCase() as HttpMethod;
    const pathname = url.pathname;

    // Parse query params
    const query: Record<string, string> = {};
    url.searchParams.forEach((v, k) => {
      query[k] = v;
    });

    // Find matching route
    for (const route of this.routes) {
      if (route.method !== method) continue;
      const match = pathname.match(route.pattern);
      if (!match) continue;

      const params: Record<string, string> = {};
      route.paramNames.forEach((name, i) => {
        params[name] = decodeURIComponent(match[i + 1]);
      });

      // Parse body for non-GET requests
      let body: unknown;
      if (method !== 'GET' && method !== 'OPTIONS') {
        body = await parseBody(req);
      }

      const ctx: RouteContext = { req, res, params, query, body };

      // Execute middleware chain then handler
      const chain = [...this.middlewares];
      let index = 0;

      const next = async (): Promise<void> => {
        if (index < chain.length) {
          const mw = chain[index++];
          await mw(ctx, next);
        } else {
          await route.handler(ctx);
        }
      };

      try {
        await next();
      } catch (err) {
        if (!res.headersSent) {
          sendJson(res, 500, {
            error: 'Internal Server Error',
            message: err instanceof Error ? err.message : 'Unknown error',
          });
        }
      }
      return;
    }

    // No route matched
    sendJson(res, 404, {
      error: 'Not Found',
      message: `No route matches ${method} ${pathname}`,
    });
  }
}

export function sendJson(res: ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

async function parseBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const maxSize = 1_048_576; // 1MB

    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxSize) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (chunks.length === 0) {
        resolve(undefined);
        return;
      }
      const raw = Buffer.concat(chunks).toString('utf-8');
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve(raw);
      }
    });

    req.on('error', reject);
  });
}
