import { beforeEach, describe, expect, it, vi } from "vitest";

const listDevices = vi.fn();
const registerDevice = vi.fn();
const fingerprint = "a".repeat(64);
const readVaultBundle = vi.fn(() => null as unknown);

vi.mock("./deviceFingerprint", () => ({
  getOrCreateDeviceFingerprint: () => fingerprint,
}));

vi.mock("./localVaultBundle", () => ({
  readVaultBundle: (userId: string) => readVaultBundle(userId),
}));

vi.mock("@okkey/crypto", () => ({
  initCrypto: vi.fn(async () => undefined),
  ed25519Keypair: () => new Uint8Array(64),
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
    expect(snapshot.status).toBe("pending");
    expect(snapshot.deviceId).toBe("d-new");
    expect(snapshot.approverDevices).toHaveLength(1);
  });

  it("returns trusted when fingerprint matches", async () => {
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
    expect(snapshot.status).toBe("trusted");
    expect(snapshot.deviceId).toBe("d-me");
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
