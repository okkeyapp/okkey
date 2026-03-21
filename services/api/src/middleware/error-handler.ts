import type { Logger } from "../logger.ts";
import { json, type Middleware } from "../http.ts";

export function createErrorHandlerMiddleware(logger: Logger): Middleware {
  return async (ctx, next) => {
    try {
      await next();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unhandled server error";

      logger.error("request failed", {
        requestId: ctx.requestId,
        method: ctx.req.method,
        path: ctx.req.url,
        error: message,
      });

      json(ctx.res, 500, {
        error: "INTERNAL_SERVER_ERROR",
        message: "Internal server error",
        requestId: ctx.requestId,
      });
    }
  };
}
