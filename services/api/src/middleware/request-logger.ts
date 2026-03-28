import type { Logger } from "../logger.ts";
import type { Middleware } from "../http.ts";
import { CAPSULE_KEY_QUERY_PARAM_NAMES } from "../capsule/key-transport-policy.ts";

export function sanitizeRequestUrlForLogs(url: string | undefined): string | undefined {
  if (!url) {
    return url;
  }
  try {
    const parsed = new URL(url, "http://localhost");
    let hasSensitive = false;
    for (const key of parsed.searchParams.keys()) {
      if (CAPSULE_KEY_QUERY_PARAM_NAMES.has(key)) {
        hasSensitive = true;
        parsed.searchParams.set(key, "[redacted]");
      }
    }
    if (!hasSensitive) {
      return parsed.pathname + parsed.search;
    }
    const query = parsed.searchParams.toString();
    return query ? `${parsed.pathname}?${query}` : parsed.pathname;
  } catch {
    return url;
  }
}

export function createRequestLoggerMiddleware(logger: Logger): Middleware {
  return async (ctx, next) => {
    const startedAt = Date.now();

    await next();

    logger.info("request completed", {
      requestId: ctx.requestId,
      method: ctx.req.method,
      path: sanitizeRequestUrlForLogs(ctx.req.url),
      statusCode: ctx.res.statusCode,
      durationMs: Date.now() - startedAt,
    });
  };
}
