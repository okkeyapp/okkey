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

export function clientIpFromTrustedProxy(
  remoteAddress: string | undefined,
  forwardedFor: string | undefined,
  trustedProxyHops: number,
): string {
  const remote = normalizeIp(remoteAddress);
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

function normalizeIp(value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    return "unknown";
  }
  return trimmed.startsWith("::ffff:") ? trimmed.slice(7) : trimmed;
}

function isLookupCandidate(ipAddress: string): boolean {
  return ipAddress !== "unknown" && ipAddress !== "127.0.0.1" && ipAddress !== "::1";
}

function unknownLocation(): GeoIpLocation {
  return { country: null, city: null };
}
