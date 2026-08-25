import { stat } from "node:fs/promises";
import maxmind, { type CityResponse, type Reader } from "maxmind";
import type { Logger } from "../logger.ts";

export interface GeoIpLocation {
  country: string | null;
  city: string | null;
}

export interface GeoIpLookup {
  lookup(ipAddress: string): Promise<GeoIpLocation>;
}

export class MmdbGeoIpLookup implements GeoIpLookup {
  private reader: Reader<CityResponse> | null = null;
  private loadedMtimeMs = 0;
  private lastFailureLogMs = 0;
  private readonly enabled: boolean;
  private readonly databasePath: string;
  private readonly log?: Logger;

  constructor(
    enabled: boolean,
    databasePath: string,
    log?: Logger,
  ) {
    this.enabled = enabled;
    this.databasePath = databasePath;
    this.log = log;
  }

  async lookup(ipAddress: string): Promise<GeoIpLocation> {
    if (!this.enabled || !isLookupCandidate(ipAddress)) {
      return unknownLocation();
    }
    await this.reloadIfChanged();
    const result = this.reader?.get(ipAddress);
    return {
      country: result?.country?.names?.en ?? result?.country?.iso_code ?? null,
      city: result?.city?.names?.en ?? null,
    };
  }

  private async reloadIfChanged(): Promise<void> {
    try {
      const file = await stat(this.databasePath);
      if (this.reader && file.mtimeMs === this.loadedMtimeMs) {
        return;
      }
      this.reader = await maxmind.open<CityResponse>(this.databasePath);
      this.loadedMtimeMs = file.mtimeMs;
      this.log?.info("GeoIP MMDB loaded", {
        databasePath: this.databasePath,
        modifiedAt: file.mtime.toISOString(),
      });
    } catch (error) {
      const now = Date.now();
      if (now - this.lastFailureLogMs > 60 * 60 * 1000) {
        this.lastFailureLogMs = now;
        this.log?.warn("GeoIP MMDB unavailable; location will be Unknown", {
          databasePath: this.databasePath,
          error: error instanceof Error ? error.message : "unknown error",
        });
      }
    }
  }
}

/**
 * Prefer X-Forwarded-For when the TCP peer is loopback (local reverse proxy / tunnel),
 * even if TRUSTED_PROXY_HOPS is 0. Otherwise only honor forwarded headers when hops > 0.
 */
export function clientIpFromTrustedProxy(
  remoteAddress: string | undefined,
  forwardedFor: string | undefined,
  trustedProxyHops: number,
): string {
  const remote = normalizeIp(remoteAddress);

  if (isLoopbackIp(remote) && forwardedFor) {
    const first = normalizeIp(forwardedFor.split(",")[0]);
    if (first !== "unknown" && !isLoopbackIp(first)) {
      return first;
    }
  }

  if (trustedProxyHops <= 0 || !forwardedFor) {
    return remote;
  }
  const chain = forwardedFor
    .split(",")
    .map((entry) => normalizeIp(entry))
    .filter((entry) => entry !== "unknown");
  if (remote !== "unknown") {
    chain.push(remote);
  }
  const index = Math.max(0, chain.length - trustedProxyHops - 1);
  return chain[index] ?? remote;
}

/**
 * When the request comes from loopback (local web ↔ API), replace ::1/127.0.0.1 with the
 * machine's public egress IP so GeoIP and db-ip links match what the owner sees on db-ip.com.
 * Does not send the requester IP to a third party — only asks "what is this host's egress IP?".
 */
export async function resolveClientIpForGeo(
  remoteAddress: string | undefined,
  forwardedFor: string | undefined,
  trustedProxyHops: number,
  log?: Logger,
): Promise<string> {
  const ipAddress = clientIpFromTrustedProxy(remoteAddress, forwardedFor, trustedProxyHops);
  if (!isLoopbackIp(ipAddress)) {
    return ipAddress;
  }
  const egress = await resolveEgressPublicIp(log);
  return egress ?? ipAddress;
}

export function isLoopbackIp(ipAddress: string): boolean {
  const ip = normalizeIp(ipAddress);
  return ip === "127.0.0.1" || ip === "::1" || ip === "0:0:0:0:0:0:0:1";
}

/** True when the address is suitable for a db-ip.com/{ip} deep link. */
export function isPublicLookupIp(ipAddress: string): boolean {
  const ip = normalizeIp(ipAddress);
  if (ip === "unknown" || isLoopbackIp(ip) || !isLookupCandidate(ip)) {
    return false;
  }
  return !isPrivateIp(ip);
}

let cachedEgressIp: string | null = null;
let egressIpPromise: Promise<string | null> | null = null;

export async function resolveEgressPublicIp(log?: Logger): Promise<string | null> {
  if (cachedEgressIp) {
    return cachedEgressIp;
  }
  if (!egressIpPromise) {
    egressIpPromise = fetchEgressPublicIp(log).finally(() => {
      egressIpPromise = null;
    });
  }
  const ip = await egressIpPromise;
  if (ip) {
    cachedEgressIp = ip;
  }
  return ip;
}

/** Test helper — clears the egress IP cache between unit tests. */
export function resetEgressPublicIpCache(): void {
  cachedEgressIp = null;
  egressIpPromise = null;
}

async function fetchEgressPublicIp(log?: Logger): Promise<string | null> {
  try {
    const response = await fetch("https://api64.ipify.org", {
      signal: AbortSignal.timeout(3_000),
      headers: { Accept: "text/plain" },
    });
    if (!response.ok) {
      return null;
    }
    const text = (await response.text()).trim();
    const ip = normalizeIp(text);
    if (ip === "unknown" || isLoopbackIp(ip) || isPrivateIp(ip)) {
      return null;
    }
    return ip;
  } catch (error) {
    log?.warn("Failed to resolve egress public IP for local GeoIP fallback", {
      error: error instanceof Error ? error.message : "unknown error",
    });
    return null;
  }
}

function normalizeIp(value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    return "unknown";
  }
  // Strip zone id (fe80::1%lo0) and IPv4-mapped IPv6.
  const withoutZone = trimmed.split("%")[0] ?? trimmed;
  return withoutZone.startsWith("::ffff:") ? withoutZone.slice(7) : withoutZone;
}

function isLookupCandidate(ipAddress: string): boolean {
  return ipAddress !== "unknown" && !isLoopbackIp(ipAddress);
}

function isPrivateIp(ipAddress: string): boolean {
  const ip = normalizeIp(ipAddress);
  if (ip.includes(":")) {
    const lower = ip.toLowerCase();
    return (
      lower.startsWith("fc") ||
      lower.startsWith("fd") ||
      lower.startsWith("fe80:") ||
      lower === "::" ||
      lower === "0:0:0:0:0:0:0:0"
    );
  }
  const parts = ip.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  const [a, b] = parts;
  return (
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254)
  );
}

function unknownLocation(): GeoIpLocation {
  return { country: null, city: null };
}
