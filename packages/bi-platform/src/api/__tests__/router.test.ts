import { describe, it, expect, vi } from 'vitest';
import { Router, sendJson } from '../router.js';

function createMockReq(method: string, url: string) {
  return {
    method,
    url,
    headers: { host: 'localhost' },
    on: vi.fn(),
    destroy: vi.fn(),
  } as any;
}

function createMockRes() {
  const res: any = {
    _body: '',
    _status: 200,
    headersSent: false,
    writeHead: vi.fn(function (this: any, status: number) { this._status = status; return this; }),
    end: vi.fn(function (this: any, body?: string) { this._body = body ?? ''; return this; }),
  };
  return res;
}

describe('Router', () => {
  it('routes GET requests to matching handler', async () => {
    const router = new Router();
    router.get('/test', (ctx) => {
      sendJson(ctx.res, 200, { ok: true });
    });

    const req = createMockReq('GET', '/test');
    const res = createMockRes();
    await router.handle(req, res);

    expect(res._status).toBe(200);
    expect(JSON.parse(res._body)).toEqual({ ok: true });
  });

  it('returns 404 for unmatched routes', async () => {
    const router = new Router();
    const req = createMockReq('GET', '/nonexistent');
    const res = createMockRes();
    await router.handle(req, res);

    expect(res._status).toBe(404);
  });

  it('extracts path parameters', async () => {
    const router = new Router();
    let capturedParams: Record<string, string> = {};

    router.get('/users/:userId/posts/:postId', (ctx) => {
      capturedParams = ctx.params;
      sendJson(ctx.res, 200, ctx.params);
    });

    const req = createMockReq('GET', '/users/abc/posts/123');
    const res = createMockRes();
    await router.handle(req, res);

    expect(capturedParams.userId).toBe('abc');
    expect(capturedParams.postId).toBe('123');
  });

  it('parses query parameters', async () => {
    const router = new Router();
    let capturedQuery: Record<string, string> = {};

    router.get('/search', (ctx) => {
      capturedQuery = ctx.query;
      sendJson(ctx.res, 200, ctx.query);
    });

    const req = createMockReq('GET', '/search?q=test&page=2');
    const res = createMockRes();
    await router.handle(req, res);

    expect(capturedQuery.q).toBe('test');
    expect(capturedQuery.page).toBe('2');
  });

  it('runs middleware in order', async () => {
    const router = new Router();
    const order: number[] = [];

    router.use(async (_ctx, next) => {
      order.push(1);
      await next();
      order.push(4);
    });
    router.use(async (_ctx, next) => {
      order.push(2);
      await next();
      order.push(3);
    });
    router.get('/test', (ctx) => {
      sendJson(ctx.res, 200, { ok: true });
    });

    const req = createMockReq('GET', '/test');
    const res = createMockRes();
    await router.handle(req, res);

    expect(order).toEqual([1, 2, 3, 4]);
  });

  it('catches handler errors and returns 500', async () => {
    const router = new Router();
    router.get('/error', () => {
      throw new Error('test error');
    });

    const req = createMockReq('GET', '/error');
    const res = createMockRes();
    await router.handle(req, res);

    expect(res._status).toBe(500);
    expect(JSON.parse(res._body).message).toBe('test error');
  });
});

describe('sendJson', () => {
  it('sends JSON with correct headers', () => {
    const res = createMockRes();
    sendJson(res, 201, { id: 1 });

    expect(res._status).toBe(201);
    expect(res.writeHead).toHaveBeenCalledWith(201, expect.objectContaining({
      'Content-Type': 'application/json',
    }));
    expect(JSON.parse(res._body)).toEqual({ id: 1 });
  });
});
