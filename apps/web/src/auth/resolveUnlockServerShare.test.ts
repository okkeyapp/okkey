import { beforeEach, describe, expect, it, vi } from "vitest";

const getVaultUnlockBootstrap = vi.hoisted(() => vi.fn());
const rememberServerKeyShare = vi.hoisted(() => vi.fn());
const acquireServerKeyShare = vi.hoisted(() => vi.fn());
const mergeDeviceShareFromServer = vi.hoisted(() => vi.fn());
const deviceShareRewriteB64 = vi.hoisted(() => vi.fn());
const mapVaultUnlockBootstrapToStored = vi.hoisted(() => vi.fn());
const writeVaultBundle = vi.hoisted(() => vi.fn());
const readVaultBundle = vi.hoisted(() => vi.fn());

vi.mock("../api/client", () => ({
  createAuthenticatedCoreClient: () => ({
    getVaultUnlockBootstrap,
  }),
}));

vi.mock("./deviceFingerprint", () => ({
  getOrCreateDeviceFingerprint: () => "fp",
}));

vi.mock("./deviceTrust", () => ({
  registerCurrentBrowserDevice: vi.fn(async () => undefined),
}));

vi.mock("./localVaultBundle", () => ({
  writeVaultBundle,
  readVaultBundle,
}));

vi.mock("@okkey/vault", () => ({
  acquireServerKeyShare,
  rememberServerKeyShare,
  mergeDeviceShareFromServer,
  deviceShareRewriteB64,
  mapVaultUnlockBootstrapToStored,
}));

import { resolveUnlockServerShare } from "./resolveUnlockServerShare";

const bundle = {
  device_share_b64: "placeholder-hybrid",
  password_kdf_salt_b64: "salt",
  password_kdf_params_version: 1,
  encrypted_private_key: {
    crypto_version: 1,
    algorithm: "xchacha20-poly1305",
    payload: "blob",
    meta: {},
  },
  server_key_share_b64: "legacy-a",
};

describe("resolveUnlockServerShare", () => {
  beforeEach(() => {
    getVaultUnlockBootstrap.mockReset();
    rememberServerKeyShare.mockReset();
    acquireServerKeyShare.mockReset();
    mergeDeviceShareFromServer.mockReset();
    deviceShareRewriteB64.mockReset();
    mapVaultUnlockBootstrapToStored.mockReset();
    writeVaultBundle.mockReset();
    readVaultBundle.mockReset();
  });

  it("refreshes device share B from bootstrap even when server share A is already cached", async () => {
    getVaultUnlockBootstrap.mockResolvedValue({
      server_key_share: "server-a",
      device_share: "approved-hybrid",
      password_kdf_salt: "salt",
      password_kdf_params_version: 1,
      encrypted_private_key: bundle.encrypted_private_key,
    });
    mergeDeviceShareFromServer.mockReturnValue({
      deviceShareB64: "approved-hybrid",
      rewrite: false,
    });
    mapVaultUnlockBootstrapToStored.mockReturnValue({
      ...bundle,
      device_share_b64: "approved-hybrid",
      server_key_share_b64: "server-a",
    });

    const acquired = await resolveUnlockServerShare({
      userId: "user-1",
      accessToken: "tok",
      bundle,
    });

    expect(getVaultUnlockBootstrap).toHaveBeenCalledTimes(1);
    expect(writeVaultBundle).toHaveBeenCalledWith(
      expect.objectContaining({ device_share_b64: "approved-hybrid" }),
      "user-1",
    );
    expect(rememberServerKeyShare).toHaveBeenCalledWith("user-1", "server-a");
    expect(acquired).toEqual({ shareB64: "server-a", source: "server" });
    expect(acquireServerKeyShare).not.toHaveBeenCalled();
  });
});
