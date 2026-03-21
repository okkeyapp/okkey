import { json, type RouteHandler } from "../http.ts";

export function createReadyRouteHandler(
  check: () => Promise<void>,
): RouteHandler {
  return async (ctx) => {
    try {
      await check();
      json(ctx.res, 200, {
        status: "ready",
        requestId: ctx.requestId,
      });
    } catch {
      json(ctx.res, 503, {
        status: "not_ready",
        requestId: ctx.requestId,
      });
    }
  };
}
