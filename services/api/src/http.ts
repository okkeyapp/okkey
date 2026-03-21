import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";

export interface RequestContext {
  requestId: string;
  req: IncomingMessage;
  res: ServerResponse;
}

export type Middleware = (
  ctx: RequestContext,
  next: () => Promise<void>,
) => Promise<void>;

export type RouteHandler = (ctx: RequestContext) => Promise<void>;

interface RouteRecord {
  method: string;
  path: string;
  handler: RouteHandler;
}

export class HttpApp {
  private readonly middlewares: Middleware[] = [];
  private readonly routes: RouteRecord[] = [];

  use(middleware: Middleware): void {
    this.middlewares.push(middleware);
  }

  route(method: string, path: string, handler: RouteHandler): void {
    this.routes.push({
      method: method.toUpperCase(),
      path,
      handler,
    });
  }

  handler() {
    return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
      const ctx: RequestContext = {
        requestId: randomUUID(),
        req,
        res,
      };

      const route = this.matchRoute(req.method, req.url);

      const chain = [...this.middlewares];
      chain.push(async (innerCtx) => {
        if (!route) {
          json(innerCtx.res, 404, {
            error: "NOT_FOUND",
            message: "Route not found",
            requestId: innerCtx.requestId,
          });
          return;
        }

        await route.handler(innerCtx);
      });

      await this.runMiddlewares(ctx, chain, 0);
    };
  }

  private matchRoute(method: string | undefined, url: string | undefined) {
    const normalizedMethod = (method ?? "GET").toUpperCase();
    const pathname = new URL(url ?? "/", "http://localhost").pathname;

    return this.routes.find(
      (route) => route.method === normalizedMethod && route.path === pathname,
    );
  }

  private async runMiddlewares(
    ctx: RequestContext,
    middlewares: Middleware[],
    index: number,
  ): Promise<void> {
    const middleware = middlewares[index];
    if (!middleware) {
      return;
    }

    await middleware(ctx, async () => {
      await this.runMiddlewares(ctx, middlewares, index + 1);
    });
  }
}

export function json(
  res: ServerResponse,
  statusCode: number,
  payload: unknown,
): void {
  if (res.writableEnded) {
    return;
  }

  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}
