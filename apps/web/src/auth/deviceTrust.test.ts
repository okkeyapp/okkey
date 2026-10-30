import { ApiRequestError } from "@okkey/api";
import { beforeEach, describe, expect, it, vi } from "vitest";

const listDevices = vi.fn();
const registerDevice = vi.fn();
const createDeviceBindChallenge = vi.fn();
const bindDeviceSession = vi.fn();
const requestDeviceKeyRebind = vi.fn();
const fingerprint = "a".repeat(64);
const readVaultBundle = vi.fn(() => null as unknown);

const hasDeviceSigningKey = vi.fn(async () => true);
const ensureDeviceSigningPublicKey = vi.fn(async () => btoa("pub-key-32-bytes-pad!!!!!!"));
const signDeviceBindChallenge = vi.fn(async (message: Uint8Array) => message);
const rotateDeviceSigningKey = vi.fn(async () => btoa("new-pub-key-32-bytes-pad!!!!"));
const clearDeviceSigningKey = vi.fn(async () => undefined);

vi.mock("./deviceFingerprint", async () => {
  const actual = await vi.importActual<typeof import("./deviceFingerprint")>("./deviceFingerprint");
  return {
    ...actual,
    getOrCreateDeviceFingerprint: () => fingerprint,
  };
});

vi.mock("./localVaultBundle", () => ({
  readVaultBundle: (userId: string) => readVaultBundle(userId),
}));

vi.mock("./deviceSigningKey", () => ({
  hasDeviceSigningKey: () => hasDeviceSigningKey(),
  ensureDeviceSigningPublicKey: () => ensureDeviceSigningPublicKey(),
  signDeviceBindChallenge: (message: Uint8Array) => signDeviceBindChallenge(message),
  rotateDeviceSigningKey: () => rotateDeviceSigningKey(),
  clearDeviceSigningKey: () => clearDeviceSigningKey(),
}));

vi.mock("@okkey/crypto", () => ({
  initCrypto: vi.fn(async () => undefined),
  wipeBytes: vi.fn(),
}));

import { clearBoundDeviceSession, pollDeviceTrust, resolveDeviceTrust } from "./deviceTrust";

function coreClient(extra?: Record<string, unknown>) {
  return {
    listDevices,
    registerDevice,
    createDeviceBindChallenge,
    bindDeviceSession,
    requestDeviceKeyRebind,
    ...extra,
  } as never;
}

function vaultBundle() {
  return {
    server_key_share_b64: "c2VydmVy",
    device_share_b64: btoa("device-share-bytes-32!!!!!!!!!!!!".slice(0, 32)),
    password_kdf_salt_b64: "c2FsdA==",
    password_kdf_params_version: 1,
    encrypted_private_key: { ciphertext: "x", nonce: "n" },
  };
}

describe("resolveDeviceTrust", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearBoundDeviceSession();
    readVaultBundle.mockReturnValue(null);
    hasDeviceSigningKey.mockResolvedValue(true);
    ensureDeviceSigningPublicKey.mockResolvedValue(btoa("pub-key-32-bytes-pad!!!!!!"));
    createDeviceBindChallenge.mockResolvedValue({
      challenge_id: "ch-1",
      challenge: btoa("bind-message"),
      expires_at: "2026-01-01T00:02:00.000Z",
    });
    bindDeviceSession.mockResolvedValue({ device_id: "d-me", status: "trusted" });
  });

  it("registers pending when fingerprint is unknown even without local bundle gate", async () => {
    listDevices
      .mockResolvedValueOnce({
        devices: [
          {
            device_id: "d-old",
            device_fingerprint: "b".repeat(64),
            status: "trusted",
          },
        ],
        pending: [],
      })
      .mockResolvedValueOnce({
        devices: [
          {
            device_id: "d-old",
            device_fingerprint: "b".repeat(64),
            status: "trusted",
          },
        ],
        pending: [
          {
            device_id: "d-new",
            device_fingerprint: fingerprint,
            status: "pending_approval",
          },
        ],
      });
    registerDevice.mockResolvedValue({ device_id: "d-new", status: "pending_approval" });

    const snapshot = await resolveDeviceTrust(coreClient(), "u1");

    expect(registerDevice).toHaveBeenCalledOnce();
    expect(registerDevice.mock.calls[0]?.[0]?.metadata?.reclaim_sole_trusted).toBe(false);
    expect(registerDevice.mock.calls[0]?.[0]?.locale).toBe("en");
    expect(snapshot.status).toBe("pending");
    expect(snapshot.deviceId).toBe("d-new");
    expect(snapshot.approverDevices).toHaveLength(1);
  });

  it("binds a trusted fingerprint with a device-key signature and does not register", async () => {
    listDevices.mockResolvedValue({
      devices: [
        {
          device_id: "d-me",
          device_fingerprint: fingerprint,
          status: "trusted",
        },
      ],
      pending: [],
    });

    const snapshot = await resolveDeviceTrust(coreClient(), "u1");

    expect(registerDevice).not.toHaveBeenCalled();
    expect(createDeviceBindChallenge).toHaveBeenCalledWith("d-me");
    expect(bindDeviceSession).toHaveBeenCalledWith(
      "d-me",
      expect.objectContaining({ challenge_id: "ch-1", signature: expect.any(String) }),
    );
    expect(snapshot.status).toBe("trusted");
    expect(snapshot.deviceId).toBe("d-me");
  });

  it("requests key rebind when trusted fingerprint has no local seed and another device can approve", async () => {
    hasDeviceSigningKey.mockResolvedValue(false);
    listDevices
      .mockResolvedValueOnce({
        devices: [
          {
            device_id: "d-me",
            device_fingerprint: fingerprint,
            status: "trusted",
          },
          {
            device_id: "d-other",
            device_fingerprint: "b".repeat(64),
            status: "trusted",
          },
        ],
        pending: [],
      })
      .mockResolvedValueOnce({
        devices: [
          {
            device_id: "d-other",
            device_fingerprint: "b".repeat(64),
            status: "trusted",
          },
        ],
        pending: [
          {
            device_id: "d-me",
            device_fingerprint: fingerprint,
            status: "pending_approval",
          },
        ],
      });
    requestDeviceKeyRebind.mockResolvedValue({
      device_id: "d-me",
      status: "pending_approval",
    });

    const snapshot = await resolveDeviceTrust(coreClient(), "u1");

    expect(rotateDeviceSigningKey).toHaveBeenCalledOnce();
    expect(requestDeviceKeyRebind).toHaveBeenCalledWith(
      "d-me",
      expect.objectContaining({ device_public_key: expect.any(String) }),
    );
    expect(registerDevice).not.toHaveBeenCalled();
    expect(snapshot.status).toBe("pending");
    expect(snapshot.deviceId).toBe("d-me");
  });

  it("requires recovery when sole trusted device has no local seed", async () => {
    hasDeviceSigningKey.mockResolvedValue(false);
    listDevices.mockResolvedValue({
      devices: [
        {
          device_id: "d-me",
          device_fingerprint: fingerprint,
          status: "trusted",
        },
      ],
      pending: [],
    });

    const snapshot = await resolveDeviceTrust(coreClient(), "u1");

    expect(requestDeviceKeyRebind).not.toHaveBeenCalled();
    expect(registerDevice).not.toHaveBeenCalled();
    expect(snapshot.status).toBe("error");
    expect(snapshot.needsRecovery).toBe(true);
    expect(snapshot.errorMessage).toBe("DEVICE_REBIND_REQUIRES_RECOVERY");
  });

  it("rethrows 401 from listDevices so the session can clear to sign-in", async () => {
    listDevices.mockRejectedValue(
      new ApiRequestError(401, { error: "AUTH_REQUIRED", message: "auth required" }),
    );

    await expect(resolveDeviceTrust(coreClient(), "u1")).rejects.toMatchObject({
      name: "ApiRequestError",
      status: 401,
    });
    expect(registerDevice).not.toHaveBeenCalled();
  });

  it("treats active blocked fingerprint as blocked even when a trusted row also matches", async () => {
    listDevices.mockResolvedValue({
      devices: [
        {
          device_id: "d-trusted",
          device_fingerprint: fingerprint,
          status: "trusted",
        },
      ],
      pending: [],
      blocked: [
        {
          device_id: "d-blocked",
          device_fingerprint: fingerprint,
          status: "blocked",
          blocked_until: null,
        },
      ],
    });

    const snapshot = await resolveDeviceTrust(coreClient(), "u1");

    expect(registerDevice).not.toHaveBeenCalled();
    expect(clearDeviceSigningKey).toHaveBeenCalled();
    expect(snapshot.status).toBe("blocked");
    expect(snapshot.deviceId).toBe("d-blocked");
    expect(snapshot.blockedUntil).toBeNull();
  });

  it("reclaims sole trusted device only for legacy hex fingerprints with a local vault bundle", async () => {
    const legacyFp = "c".repeat(64);
    readVaultBundle.mockReturnValue(vaultBundle());
    listDevices.mockResolvedValue({
      devices: [
        {
          device_id: "d-old",
          device_fingerprint: legacyFp,
          status: "trusted",
          client_type: "web",
        },
      ],
      pending: [],
    });
    registerDevice.mockResolvedValue({ device_id: "d-old", status: "trusted" });

    const snapshot = await resolveDeviceTrust(coreClient(), "u1");

    expect(registerDevice).toHaveBeenCalledOnce();
    expect(registerDevice.mock.calls[0]?.[0]?.metadata?.reclaim_sole_trusted).toBe(true);
    expect(snapshot.status).toBe("trusted");
    expect(snapshot.deviceId).toBe("d-old");
  });

  it("does not reclaim when sole trusted fingerprint is already structured", async () => {
    readVaultBundle.mockReturnValue(vaultBundle());
    listDevices.mockResolvedValue({
      devices: [
        {
          device_id: "d-firefox",
          device_fingerprint: "web_app-firefox-macos-abc123",
          status: "trusted",
          client_type: "web",
        },
      ],
      pending: [],
    });
    registerDevice.mockResolvedValue({ device_id: "d-new", status: "pending_approval" });

    const snapshot = await resolveDeviceTrust(coreClient(), "u1");

    expect(registerDevice).toHaveBeenCalledOnce();
    expect(registerDevice.mock.calls[0]?.[0]?.metadata?.reclaim_sole_trusted).toBe(false);
    expect(snapshot.status).toBe("pending");
  });

  it("bootstraps trusted when vault bundle exists and no trusted devices remain", async () => {
    readVaultBundle.mockReturnValue(vaultBundle());
    listDevices
      .mockResolvedValueOnce({
        devices: [],
        pending: [
          {
            device_id: "d-pending",
            device_fingerprint: fingerprint,
            status: "pending_approval",
          },
        ],
      })
      .mockResolvedValueOnce({
        devices: [
          {
            device_id: "d-pending",
            device_fingerprint: fingerprint,
            status: "trusted",
          },
        ],
        pending: [],
      });
    registerDevice.mockResolvedValue({ device_id: "d-pending", status: "trusted" });

    const snapshot = await resolveDeviceTrust(coreClient(), "u1");

    expect(registerDevice).toHaveBeenCalledOnce();
    expect(registerDevice.mock.calls[0]?.[0]?.metadata?.reclaim_sole_trusted).toBe(false);
    expect(snapshot.status).toBe("trusted");
    expect(snapshot.deviceId).toBe("d-pending");
  });
});

describe("pollDeviceTrust", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearBoundDeviceSession();
    hasDeviceSigningKey.mockResolvedValue(true);
    createDeviceBindChallenge.mockResolvedValue({
      challenge_id: "ch-1",
      challenge: btoa("bind-message"),
      expires_at: "2026-01-01T00:02:00.000Z",
    });
    bindDeviceSession.mockResolvedValue({ device_id: "d-me", status: "trusted" });
  });

  it("binds an unbound trusted fingerprint instead of reporting trusted", async () => {
    listDevices.mockResolvedValue({
      devices: [
        {
          device_id: "d-me",
          device_fingerprint: fingerprint,
          status: "trusted",
        },
      ],
      pending: [],
    });

    const snapshot = await pollDeviceTrust(coreClient(), fingerprint, null);

    expect(createDeviceBindChallenge).toHaveBeenCalledWith("d-me");
    expect(bindDeviceSession).toHaveBeenCalled();
    expect(snapshot.status).toBe("trusted");
    expect(snapshot.deviceId).toBe("d-me");
  });

  it("keeps error when bind proof fails so recovery gate cannot open unbound", async () => {
    listDevices.mockResolvedValue({
      devices: [
        {
          device_id: "d-me",
          device_fingerprint: fingerprint,
          status: "trusted",
        },
      ],
      pending: [],
    });
    bindDeviceSession.mockRejectedValue(new Error("DEVICE_BIND_PROOF_INVALID"));

    const snapshot = await pollDeviceTrust(coreClient(), fingerprint, null);

    expect(snapshot.status).toBe("error");
    expect(snapshot.deviceId).toBe("d-me");
  });
});
