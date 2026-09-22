/**
 * In-memory warm cache for Personal Settings popup tabs.
 * Prefetch on open; clear on close / lock / logout.
 * Never stores plaintext recovery keys or TOTP backup codes — status/lists only.
 */
import type { CoreApiClient } from "@okkey/api";
import { AuthClient } from "@okkey/auth";
import type {
  AccountLoginMethodsResponseDto,
  AccountRecoveryStatusResponseDto,
  DeviceListItemDto,
  TwoFactorStatusResponseDto,
} from "@okkey/types";

import type { NormalizedAccountProfileWire } from "../../auth/normalizeAccountProfileWire";
import { normalizeAccountProfileWire } from "../../auth/normalizeAccountProfileWire";

export type SettingsDevicesListCache = {
  devices: DeviceListItemDto[];
  pending: DeviceListItemDto[];
  blocked: DeviceListItemDto[];
};

export type SettingsPopupCacheKey = "recovery" | "devices" | "login" | "twoFactor" | "profile";

export type SettingsPopupSliceStatus = "idle" | "loading" | "ready" | "error";

export type SettingsPopupSlice<T> = {
  status: SettingsPopupSliceStatus;
  data: T | null;
  error: string | null;
  inflight: Promise<void> | null;
};

export type SettingsPopupCacheState = {
  recovery: SettingsPopupSlice<AccountRecoveryStatusResponseDto>;
  devices: SettingsPopupSlice<SettingsDevicesListCache>;
  login: SettingsPopupSlice<AccountLoginMethodsResponseDto>;
  twoFactor: SettingsPopupSlice<TwoFactorStatusResponseDto>;
  profile: SettingsPopupSlice<NormalizedAccountProfileWire>;
};

function emptySlice<T>(): SettingsPopupSlice<T> {
  return { status: "idle", data: null, error: null, inflight: null };
}

function createEmptyCache(): SettingsPopupCacheState {
  return {
    recovery: emptySlice(),
    devices: emptySlice(),
    login: emptySlice(),
    twoFactor: emptySlice(),
    profile: emptySlice(),
  };
}

let cache: SettingsPopupCacheState = createEmptyCache();
let generation = 0;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

function writeSlice<K extends SettingsPopupCacheKey>(
  key: K,
  next: SettingsPopupSlice<SettingsPopupCacheState[K]["data"] extends infer D ? D : never>,
): void {
  (cache as Record<SettingsPopupCacheKey, SettingsPopupSlice<unknown>>)[key] = next as SettingsPopupSlice<unknown>;
}

export function getSettingsPopupCacheState(): SettingsPopupCacheState {
  return cache;
}

export function subscribeSettingsPopupCache(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function clearSettingsPopupCache(): void {
  generation += 1;
  cache = createEmptyCache();
  notify();
}

export function setSettingsPopupCacheData<K extends SettingsPopupCacheKey>(
  key: K,
  data: SettingsPopupCacheState[K]["data"],
): void {
  const prev = cache[key];
  writeSlice(key, {
    status: data == null ? "idle" : "ready",
    data,
    error: null,
    inflight: prev.inflight,
  } as SettingsPopupSlice<never>);
  notify();
}

type LoadSliceOptions<T> = {
  key: SettingsPopupCacheKey;
  quiet?: boolean;
  fetcher: () => Promise<T>;
  mapError?: (err: unknown) => string;
};

async function loadSlice<T>({ key, quiet = false, fetcher, mapError }: LoadSliceOptions<T>): Promise<T | null> {
  const current = cache[key] as SettingsPopupSlice<T>;
  if (current.inflight) {
    await current.inflight;
    return (cache[key] as SettingsPopupSlice<T>).data;
  }

  const gen = generation;
  const keepStale = Boolean(quiet && current.data != null);

  const run = (async () => {
    try {
      const data = await fetcher();
      if (gen !== generation) {
        return;
      }
      writeSlice(key, {
        status: "ready",
        data,
        error: null,
        inflight: null,
      } as SettingsPopupSlice<never>);
      notify();
    } catch (err) {
      if (gen !== generation) {
        return;
      }
      const message = mapError?.(err) ?? "error";
      const prevData = (cache[key] as SettingsPopupSlice<T>).data;
      writeSlice(key, {
        status: prevData != null ? "ready" : "error",
        data: prevData,
        error: message,
        inflight: null,
      } as SettingsPopupSlice<never>);
      notify();
    }
  })();

  writeSlice(key, {
    status: keepStale ? current.status : "loading",
    data: current.data,
    error: keepStale ? current.error : null,
    inflight: run,
  } as SettingsPopupSlice<never>);
  notify();

  await run;
  return (cache[key] as SettingsPopupSlice<T>).data;
}

export type PrefetchSettingsPopupCacheDeps = {
  core: CoreApiClient;
  fingerprint: string;
  includeLogin: boolean;
  mapRecoveryError?: (err: unknown) => string;
  mapDevicesError?: (err: unknown) => string;
  mapLoginError?: (err: unknown) => string;
  mapTwoFactorError?: (err: unknown) => string;
};

export async function prefetchSettingsPopupCache(deps: PrefetchSettingsPopupCacheDeps): Promise<void> {
  const auth = new AuthClient(deps.core.getHttpClient());
  const tasks: Promise<unknown>[] = [
    loadSlice({
      key: "recovery",
      fetcher: () => deps.core.getAccountRecoveryStatus(),
      mapError: deps.mapRecoveryError,
    }),
    loadSlice({
      key: "devices",
      fetcher: async () => {
        const result = await deps.core.listDevices(deps.fingerprint);
        return {
          devices: result.devices,
          pending: result.pending,
          blocked: result.blocked ?? [],
        } satisfies SettingsDevicesListCache;
      },
      mapError: deps.mapDevicesError,
    }),
    loadSlice({
      key: "twoFactor",
      fetcher: () => auth.getTwoFactorStatus(),
      mapError: deps.mapTwoFactorError,
    }),
    loadSlice({
      key: "profile",
      fetcher: async () => {
        const wire = normalizeAccountProfileWire(await deps.core.getAccountProfile());
        if (!wire) {
          throw new Error("invalid account profile");
        }
        return wire;
      },
    }),
  ];
  if (deps.includeLogin) {
    tasks.push(
      loadSlice({
        key: "login",
        fetcher: () => deps.core.getLoginMethods(),
        mapError: deps.mapLoginError,
      }),
    );
  }
  await Promise.allSettled(tasks);
}

export async function refreshSettingsPopupCacheSlice<K extends SettingsPopupCacheKey>(
  key: K,
  fetcher: () => Promise<NonNullable<SettingsPopupCacheState[K]["data"]>>,
  opts?: { quiet?: boolean; mapError?: (err: unknown) => string },
): Promise<SettingsPopupCacheState[K]["data"]> {
  return loadSlice({
    key,
    quiet: opts?.quiet,
    fetcher,
    mapError: opts?.mapError,
  }) as Promise<SettingsPopupCacheState[K]["data"]>;
}

/** True when the UI should show section skeletons (no usable cached data yet). */
export function settingsPopupSliceNeedsSkeleton<T>(slice: SettingsPopupSlice<T>): boolean {
  return slice.data == null && (slice.status === "idle" || slice.status === "loading");
}
