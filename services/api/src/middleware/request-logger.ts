import type { Logger } from "../logger.ts";
import type { Middleware } from "../http.ts";

export function createRequestLoggerMiddleware(logger: Logger): Middleware {
  return async (ctx, next) => {
    const startedAt = Date.now();

    await next();

    logger.info("request completed", {
      requestId: ctx.requestId,
      method: ctx.req.method,
      path: ctx.req.url,
      statusCode: ctx.res.statusCode,
      durationMs: Date.now() - startedAt,
    });
  };
}
