import { json, type RouteHandler } from "../http.ts";

export const healthRouteHandler: RouteHandler = async (ctx) => {
  json(ctx.res, 200, {
    status: "ok",
    service: "okkey-api",
    requestId: ctx.requestId,
    time: new Date().toISOString(),
  });
};
