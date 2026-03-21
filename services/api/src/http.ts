import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";

export interface RequestContext {
  requestId: string;
  req: IncomingMessage;
  res: ServerResponse;
  params: Record<string, string>;
}

export type Middleware = (
  ctx: RequestContext,
  next: () => Promise<void>,
) => Promise<void>;

export type RouteHandler = (ctx: RequestContext) => Promise<void>;

interface RouteRecord {
  method: string;
  pathPattern: string;
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
      pathPattern: path,
      handler,
    });
  }

  handler() {
    return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
      const ctx: RequestContext = {
        requestId: randomUUID(),
        req,
        res,
        params: {},
      };

      const route = this.matchRoute(req.method, req.url);
      if (route) {
        ctx.params = route.params;
      }

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

  private matchRoute(method: string | undefined, url: string | undefined):
    | { handler: RouteHandler; params: Record<string, string> }
    | null {
    const normalizedMethod = (method ?? "GET").toUpperCase();
    const pathname = new URL(url ?? "/", "http://localhost").pathname;

    for (const route of this.routes) {
      if (route.method !== normalizedMethod) {
        continue;
      }
      const params = matchPath(route.pathPattern, pathname);
      if (params) {
        return {
          handler: route.handler,
          params,
        };
      }
    }
    return null;
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

function matchPath(
  pattern: string,
  pathname: string,
): Record<string, string> | null {
  const patternParts = pattern.split("/").filter(Boolean);
  const pathParts = pathname.split("/").filter(Boolean);
  if (patternParts.length !== pathParts.length) {
    return null;
  }

  const params: Record<string, string> = {};
  for (let i = 0; i < patternParts.length; i += 1) {
    const patternPart = patternParts[i];
    const pathPart = pathParts[i];
    if (patternPart.startsWith(":")) {
      params[patternPart.slice(1)] = decodeURIComponent(pathPart);
      continue;
    }
    if (patternPart !== pathPart) {
      return null;
    }
  }

  return params;
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

export async function readJsonBody<T>(req: IncomingMessage): Promise<T> {
  const mockedBody = (req as IncomingMessage & { body?: unknown }).body;
  if (mockedBody !== undefined) {
    if (typeof mockedBody === "string") {
      return JSON.parse(mockedBody) as T;
    }
    return mockedBody as T;
  }

  let raw = "";
  for await (const chunk of req) {
    raw += chunk.toString();
  }

  if (!raw) {
    return {} as T;
  }
  return JSON.parse(raw) as T;
}

export function getHeader(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name.toLowerCase()];
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}
