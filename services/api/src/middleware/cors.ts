import { getHeader, type Middleware } from "../http.ts";

function resolveAllowOrigin(
  corsOriginConfig: string,
  requestOrigin: string | undefined,
): string | undefined {
  const trimmed = corsOriginConfig.trim();
  if (trimmed === "" || trimmed === "*") {
    return "*";
  }

  const allowed = trimmed
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (allowed.length === 0) {
    return "*";
  }

  if (requestOrigin && allowed.includes(requestOrigin)) {
    return requestOrigin;
  }

  // Non-browser clients often omit Origin; keep single-origin configs usable for scripts.
  if (!requestOrigin && allowed.length === 1) {
    return allowed[0];
  }

  return undefined;
}

export function createCorsMiddleware(corsOriginConfig: string): Middleware {
  return async (ctx, next) => {
    const allowOrigin = resolveAllowOrigin(corsOriginConfig, getHeader(ctx.req, "origin"));
    if (allowOrigin !== undefined) {
      ctx.res.setHeader("Access-Control-Allow-Origin", allowOrigin);
      ctx.res.setHeader("Vary", "Origin");
    }

    ctx.res.setHeader(
      "Access-Control-Allow-Methods",
      "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    );
    ctx.res.setHeader(
      "Access-Control-Allow-Headers",
      [
        "Content-Type",
        "Authorization",
        "X-Request-Id",
        "X-User-Id",
        "X-Device-Id",
        "X-Device-Fingerprint",
        "X-File-Name",
        "X-File-Mime-Type",
        "X-File-Size",
        "X-Encrypted-Key",
      ].join(", "),
    );

    if (ctx.req.method === "OPTIONS") {
      ctx.res.statusCode = 204;
      ctx.res.end();
      return;
    }

    await next();
  };
}
