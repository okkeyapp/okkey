import { describe, expect, it } from "vitest";

import {
  DEFAULT_PERSONAL_VAULT_ICON,
  DEFAULT_SHARED_VAULT_ICON,
  normalizeVaultIcon,
  vaultDisplayIcon,
  VAULT_ICON_EMOJIS,
} from "./vaultIcons";
import { memberDisplayName, memberInitials } from "./vaultAccessHelpers";

describe("vaultIcons", () => {
  it("normalizes empty icon to fallback", () => {
    expect(normalizeVaultIcon("", DEFAULT_PERSONAL_VAULT_ICON)).toBe(DEFAULT_PERSONAL_VAULT_ICON);
    expect(normalizeVaultIcon("  ", DEFAULT_SHARED_VAULT_ICON)).toBe(DEFAULT_SHARED_VAULT_ICON);
    expect(normalizeVaultIcon("🔐", DEFAULT_SHARED_VAULT_ICON)).toBe("🔐");
  });

  it("picks personal/shared defaults from vault metadata", () => {
    expect(vaultDisplayIcon({ isPersonal: true, icon: "" })).toBe(DEFAULT_PERSONAL_VAULT_ICON);
    expect(vaultDisplayIcon({ isPersonal: false, icon: "🔐" })).toBe("🔐");
  });

  it("exposes a curated emoji set", () => {
    expect(VAULT_ICON_EMOJIS.length).toBeGreaterThan(40);
    expect(VAULT_ICON_EMOJIS).toContain(DEFAULT_SHARED_VAULT_ICON);
  });
});

describe("vaultAccessHelpers", () => {
  it("builds display name and initials", () => {
    expect(
      memberDisplayName({ firstName: "Alex", lastName: "Zorin", email: "a@okkey.app" }),
    ).toBe("Alex Zorin");
    expect(memberDisplayName({ firstName: null, lastName: null, email: "a@okkey.app" })).toBe("a");
    expect(
      memberDisplayName({ firstName: null, lastName: null, email: "aleksandrzoryn@gmail.com" }),
    ).toBe("aleksandrzoryn");
    expect(memberInitials("Alex Zorin")).toBe("AZ");
  });
});
