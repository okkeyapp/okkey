import type { IncomingMessage } from "node:http";
import { clientIpFromTrustedProxy } from "./capsule/geoip.ts";
import { getHeader } from "./http.ts";

/** Client IP. Honors X-Forwarded-For only when trustedProxyHops > 0. */
export function requestClientIp(req: IncomingMessage, trustedProxyHops: number): string {
  return clientIpFromTrustedProxy(
    req.socket?.remoteAddress,
    getHeader(req, "x-forwarded-for"),
    trustedProxyHops,
  );
}
