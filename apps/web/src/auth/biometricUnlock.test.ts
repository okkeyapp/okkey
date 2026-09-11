import { describe, expect, it } from "vitest";

import { biometricErrorMessageKey, mapWebAuthnError } from "./biometricUnlock";

describe("mapWebAuthnError", () => {
  it("maps common DOMException names", () => {
    expect(mapWebAuthnError(new DOMException("x", "NotAllowedError"))).toBe("cancelled");
    expect(mapWebAuthnError(new DOMException("x", "AbortError"))).toBe("cancelled");
    expect(mapWebAuthnError(new DOMException("x", "TimeoutError"))).toBe("timeout");
    expect(mapWebAuthnError(new DOMException("x", "SecurityError"))).toBe("security");
    expect(mapWebAuthnError(new DOMException("x", "InvalidStateError"))).toBe("invalid_state");
    expect(mapWebAuthnError(new DOMException("x", "NotSupportedError"))).toBe("unsupported");
  });

  it("falls back to failed", () => {
    expect(mapWebAuthnError(new Error("boom"))).toBe("failed");
    expect(mapWebAuthnError(null)).toBe("failed");
  });
});

describe("biometricErrorMessageKey", () => {
  it("returns stable i18n keys", () => {
    expect(biometricErrorMessageKey("unavailable")).toBe(
      "web.settingsPopup.vault.biometric.error.unavailable",
    );
    expect(biometricErrorMessageKey("insecure_context")).toBe(
      "web.settingsPopup.vault.biometric.error.insecureContext",
    );
  });
});
