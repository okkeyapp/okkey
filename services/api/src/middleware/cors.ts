import type { Middleware } from "../http.ts";

export function createCorsMiddleware(origin: string): Middleware {
  return async (ctx, next) => {
    ctx.res.setHeader("Access-Control-Allow-Origin", origin);
    ctx.res.setHeader("Vary", "Origin");
    ctx.res.setHeader(
      "Access-Control-Allow-Methods",
      "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    );
    ctx.res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-Request-Id",
    );

    if (ctx.req.method === "OPTIONS") {
      ctx.res.statusCode = 204;
      ctx.res.end();
      return;
    }

    await next();
  };
}
