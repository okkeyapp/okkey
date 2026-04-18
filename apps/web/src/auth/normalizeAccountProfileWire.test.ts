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
        vault_idle_lock_seconds: 1200,
      }),
    ).toEqual({
      email: "a@b.co",
      first_name: "Ann",
      last_name: "Bee",
      vault_idle_lock_seconds: 1200,
    });
  });

  it("accepts camelCase names and idle field", () => {
    expect(
      normalizeAccountProfileWire({
        email: "x@y.z",
        firstName: "Foo",
        lastName: "Bar",
        vaultIdleLockSeconds: 600,
      }),
    ).toEqual({
      email: "x@y.z",
      first_name: "Foo",
      last_name: "Bar",
      vault_idle_lock_seconds: 600,
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
      vault_idle_lock_seconds: 900,
    });
  });
});
