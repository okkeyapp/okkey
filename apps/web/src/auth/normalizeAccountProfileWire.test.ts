import { describe, expect, it } from "vitest";

import { normalizeAccountProfileWire } from "./normalizeAccountProfileWire";

describe("normalizeAccountProfileWire", () => {
  it("returns null for non-objects", () => {
    expect(normalizeAccountProfileWire(null)).toBeNull();
    expect(normalizeAccountProfileWire("x")).toBeNull();
    expect(normalizeAccountProfileWire([])).toBeNull();
  });

  it("accepts canonical snake_case", () => {
    expect(
      normalizeAccountProfileWire({
        email: " a@b.co ",
        first_name: "Ann",
        last_name: "Bee",
        locale: "ru",
        billing_region: "DE",
        vault_idle_lock_seconds: 1200,
        master_password_changed_at: "2026-03-02T21:59:00.000Z",
      }),
    ).toEqual({
      email: "a@b.co",
      first_name: "Ann",
      last_name: "Bee",
      locale: "ru",
      billing_region: "DE",
      vault_idle_lock_seconds: 1200,
      master_password_changed_at: "2026-03-02T21:59:00.000Z",
    });
  });

  it("accepts camelCase names and idle field", () => {
    expect(
      normalizeAccountProfileWire({
        email: "x@y.z",
        firstName: "Foo",
        lastName: "Bar",
        billingRegion: "US",
        vaultIdleLockSeconds: 600,
      }),
    ).toEqual({
      email: "x@y.z",
      first_name: "Foo",
      last_name: "Bar",
      locale: null,
      billing_region: "US",
      vault_idle_lock_seconds: 600,
      master_password_changed_at: null,
    });
  });

  it("does not throw when email is null or non-string", () => {
    expect(
      normalizeAccountProfileWire({
        email: null,
        first_name: null,
        last_name: null,
      }),
    ).toEqual({
      email: "",
      first_name: null,
      last_name: null,
      locale: null,
      billing_region: null,
      vault_idle_lock_seconds: 900,
      master_password_changed_at: null,
    });
  });
});
