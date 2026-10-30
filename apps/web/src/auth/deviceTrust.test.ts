import { ApiRequestError } from "@okkey/api";
import { beforeEach, describe, expect, it, vi } from "vitest";

const listDevices = vi.fn();
const registerDevice = vi.fn();
const fingerprint = "a".repeat(64);
const readVaultBundle = vi.fn(() => null as unknown);

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

vi.mock("@okkey/crypto", () => ({
  initCrypto: vi.fn(async () => undefined),
  ed25519Keypair: () => new Uint8Array(64),
  ed25519Sign: (_secret: Uint8Array, message: Uint8Array) => message,
  wipeBytes: vi.fn(),
}));

import { resolveDeviceTrust } from "./deviceTrust";

function coreClient() {
  return { listDevices, registerDevice } as never;
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
    readVaultBundle.mockReturnValue(null);
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
    const store = new Map<string, string>([["okkey.device.private_key", btoa("seed-seed-seed-seed")]]);
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
      },
    });
    const createDeviceBindChallenge = vi.fn().mockResolvedValue({
      challenge_id: "ch-1",
      challenge: btoa("bind-message"),
      expires_at: "2026-01-01T00:02:00.000Z",
    });
    const bindDeviceSession = vi.fn().mockResolvedValue({ device_id: "d-me", status: "trusted" });
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

    const snapshot = await resolveDeviceTrust(
      { listDevices, registerDevice, createDeviceBindChallenge, bindDeviceSession } as never,
      "u1",
    );

    expect(registerDevice).not.toHaveBeenCalled();
    expect(createDeviceBindChallenge).toHaveBeenCalledWith("d-me");
    expect(bindDeviceSession).toHaveBeenCalledWith(
      "d-me",
      expect.objectContaining({ challenge_id: "ch-1", signature: expect.any(String) }),
    );
    expect(snapshot.status).toBe("trusted");
    expect(snapshot.deviceId).toBe("d-me");
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

  it("prefers active blocked over trusted for the same fingerprint", async () => {
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
    expect(snapshot.status).toBe("blocked");
    expect(snapshot.deviceId).toBe("d-blocked");
    expect(snapshot.blockedUntil).toBeNull();
  });

  it("reclaims sole trusted device when vault bundle exists", async () => {
    readVaultBundle.mockReturnValue(vaultBundle());
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
            device_fingerprint: fingerprint,
            status: "trusted",
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

  it("does not reclaim a different structured-fingerprint browser even with vault bundle", async () => {
    readVaultBundle.mockReturnValue(vaultBundle());
    listDevices
      .mockResolvedValueOnce({
        devices: [
          {
            device_id: "d-chrome",
            device_fingerprint: "web_app-chrome-macos-10.15.7",
            client_type: "chrome",
            status: "trusted",
          },
        ],
        pending: [],
      })
      .mockResolvedValueOnce({
        devices: [
          {
            device_id: "d-chrome",
            device_fingerprint: "web_app-chrome-macos-10.15.7",
            client_type: "chrome",
            status: "trusted",
          },
        ],
        pending: [
          {
            device_id: "d-firefox",
            device_fingerprint: fingerprint,
            status: "pending_approval",
          },
        ],
      });
    // Override fingerprint for this test via mock — keep hex mock as "new" browser id in this suite.
    registerDevice.mockResolvedValue({ device_id: "d-firefox", status: "pending_approval" });

    const snapshot = await resolveDeviceTrust(coreClient(), "u1");

    expect(registerDevice).toHaveBeenCalledOnce();
    expect(registerDevice.mock.calls[0]?.[0]?.metadata?.reclaim_sole_trusted).toBe(false);
    expect(snapshot.status).toBe("pending");
    expect(snapshot.deviceId).toBe("d-firefox");
  });

  it("reclaims even when current fingerprint already has a pending row", async () => {
    readVaultBundle.mockReturnValue(vaultBundle());
    listDevices
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
            device_id: "d-pending",
            device_fingerprint: fingerprint,
            status: "pending_approval",
          },
        ],
      })
      .mockResolvedValueOnce({
        devices: [
          {
            device_id: "d-old",
            device_fingerprint: fingerprint,
            status: "trusted",
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
  });
});
