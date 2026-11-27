import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createGuestSessionId,
  getOrCreateGuestSessionId,
  GuestSessionCryptoUnavailableError,
  isGuestSessionId,
} from "./guestSessionId";

function memoryStorage(initial?: Record<string, string>): Pick<Storage, "getItem" | "setItem"> {
  const values = new Map<string, string>(Object.entries(initial ?? {}));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

describe("createGuestSessionId", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("produces an id that passes isGuestSessionId via randomUUID", () => {
    const id = createGuestSessionId();
    expect(isGuestSessionId(id)).toBe(true);
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it("produces a valid UUID via getRandomValues when randomUUID is missing", () => {
    const getRandomValues = vi.fn((array: Uint8Array) => {
      for (let index = 0; index < array.length; index += 1) {
        array[index] = index + 1;
      }
      return array;
    });
    const cryptoApi = { getRandomValues } as unknown as Crypto;

    const mathSpy = vi.spyOn(Math, "random");
    const id = createGuestSessionId(cryptoApi);

    expect(getRandomValues).toHaveBeenCalled();
    expect(isGuestSessionId(id)).toBe(true);
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(mathSpy).not.toHaveBeenCalled();
  });

  it("throws when Web Crypto is unavailable and never calls Math.random", () => {
    const mathSpy = vi.spyOn(Math, "random");
    expect(() => createGuestSessionId(null)).toThrow(GuestSessionCryptoUnavailableError);
    expect(mathSpy).not.toHaveBeenCalled();
  });

  it("throws when crypto exists but has neither randomUUID nor getRandomValues", () => {
    const mathSpy = vi.spyOn(Math, "random");
    expect(() => createGuestSessionId({} as Crypto)).toThrow(GuestSessionCryptoUnavailableError);
    expect(mathSpy).not.toHaveBeenCalled();
  });
});

describe("getOrCreateGuestSessionId", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reuses a valid stored id", () => {
    const stored = "550e8400-e29b-41d4-a716-446655440000";
    const storage = memoryStorage({
      "okkey:capsule-guest:capsule-1": stored,
    });
    expect(getOrCreateGuestSessionId("capsule-1", storage)).toBe(stored);
  });

  it("replaces a stored value that fails isGuestSessionId", () => {
    const storage = memoryStorage({
      "okkey:capsule-guest:capsule-1": "not-a-session",
    });
    const created = getOrCreateGuestSessionId("capsule-1", storage);
    expect(isGuestSessionId(created)).toBe(true);
    expect(storage.getItem("okkey:capsule-guest:capsule-1")).toBe(created);
  });

  it("stores a newly created id", () => {
    const storage = memoryStorage();
    const created = getOrCreateGuestSessionId("capsule-1", storage);
    expect(isGuestSessionId(created)).toBe(true);
    expect(storage.getItem("okkey:capsule-guest:capsule-1")).toBe(created);
  });

  it("does not fall back to Math.random when Web Crypto is missing", () => {
    const mathSpy = vi.spyOn(Math, "random");
    const storage = memoryStorage();
    expect(() => getOrCreateGuestSessionId("capsule-1", storage, null)).toThrow(
      GuestSessionCryptoUnavailableError,
    );
    expect(mathSpy).not.toHaveBeenCalled();
    expect(storage.getItem("okkey:capsule-guest:capsule-1")).toBeNull();
  });
});
