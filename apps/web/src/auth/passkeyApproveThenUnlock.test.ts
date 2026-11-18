/**
 * Regression for the staging failure after passkey device approval:
 * verify uploaded the approved hybrid, but unlock kept the registration
 * placeholder whenever unlock-bootstrap could not run (soft-fail). The
 * trusted-device one-time path already wrote the claimed hybrid locally;
 * passkey must do the same before the lock screen.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const startAuthentication = vi.hoisted(() => vi.fn());
const openPasskeyShareWrap = vi.hoisted(() => vi.fn(async () => new Uint8Array(32).fill(7)));
const wrapSplitKeyShareB = vi.hoisted(() =>
  vi.fn(async () => new Uint8Array([9, 9, 9, 9])),
);
const classifySplitKeyShareBWire = vi.hoisted(() =>
  vi.fn((bytes: Uint8Array) => (bytes.length === 32 ? "legacy" : "hybrid")),
);

vi.mock("@simplewebauthn/browser", () => ({
  startAuthentication,
}));

vi.mock("@okkey/crypto", () => ({
  initCrypto: vi.fn(async () => undefined),
  sealPasskeyShareWrap: vi.fn(),
  openPasskeyShareWrap,
  openStoredSplitKeyShareB: vi.fn(),
  wrapSplitKeyShareB,
  classifySplitKeyShareBWire,
  wipeBytes: vi.fn(),
}));

vi.mock("@okkey/vault", () => ({
  loadSplitKeyShareWrapKey: vi.fn(async () => null),
  mapVaultUnlockBootstrapToStored: vi.fn(),
  envelopeB64ForPlaintextShare: vi.fn(async () =>
    Buffer.from([9, 9, 9, 9]).toString("base64"),
  ),
}));

const readVaultBundle = vi.hoisted(() => vi.fn());
const writeVaultBundle = vi.hoisted(() => vi.fn());

vi.mock("./localVaultBundle", () => ({
  readVaultBundle,
  writeVaultBundle,
}));

vi.mock("./deviceFingerprint", () => ({
  getOrCreateDeviceFingerprint: () => "fp",
}));

import { approvePendingDeviceWithPasskey } from "./passkeyDeviceApproval";

const salt = Buffer.alloc(32, 3).toString("base64");
const prf = Buffer.alloc(32, 5).toString("base64url");
const wrapEd = Buffer.alloc(32, 11).toString("base64");
const wrapPq = Buffer.alloc(32, 12).toString("base64");
const placeholder = "placeholder-hybrid";
const approved = Buffer.from([9, 9, 9, 9]).toString("base64");

describe("passkey approve then unlock (failing sequence)", () => {
  beforeEach(() => {
    startAuthentication.mockReset();
    openPasskeyShareWrap.mockReset();
    wrapSplitKeyShareB.mockReset();
    classifySplitKeyShareBWire.mockReset();
    readVaultBundle.mockReset();
    writeVaultBundle.mockReset();
    openPasskeyShareWrap.mockResolvedValue(new Uint8Array(32).fill(7));
    wrapSplitKeyShareB.mockResolvedValue(new Uint8Array([9, 9, 9, 9]));
    classifySplitKeyShareBWire.mockImplementation((bytes: Uint8Array) =>
      bytes.length === 32 ? "legacy" : "hybrid",
    );
  });

  it("replaces the local placeholder after passkey verify (OT claim parity)", async () => {
    startAuthentication.mockResolvedValue({
      id: "cred-webauthn",
      clientExtensionResults: { prf: { results: { first: prf } } },
    });

    let localShare = placeholder;
    readVaultBundle.mockImplementation(() => ({
      device_share_b64: localShare,
      password_kdf_salt_b64: "salt",
      password_kdf_params_version: 1,
      encrypted_private_key: {
        crypto_version: 1,
        algorithm: "xchacha20-poly1305",
        payload: "blob",
        meta: {},
      },
    }));
    writeVaultBundle.mockImplementation((next: { device_share_b64: string }) => {
      localShare = next.device_share_b64;
    });

    const client = {
      passkeyApprovalOptions: vi.fn(async () => ({
        challengeId: "approval-challenge",
        options: { challenge: "def" },
        prf_salt: salt,
        credentials: [
          {
            credential_id: "cred-webauthn",
            share_wrap: Buffer.from(new Uint8Array(73).fill(1)).toString("base64"),
            share_wrap_salt: salt,
            share_wrap_version: 1,
          },
        ],
        share_wrap_ed25519_public_key: wrapEd,
        share_wrap_pq_public_key: wrapPq,
      })),
      passkeyApprovalVerify: vi.fn(async () => ({
        device_id: "42",
        status: "trusted" as const,
      })),
      // Bootstrap unavailable: session just transitioned or was unbound.
      getVaultUnlockBootstrap: vi.fn(async () => {
        throw new Error("AUTH_REQUIRED");
      }),
    };

    const result = await approvePendingDeviceWithPasskey(client as never, "42", {
      userId: "user-1",
    });
    expect(result).toEqual({ ok: true });
    expect(client.passkeyApprovalOptions).toHaveBeenCalledTimes(1);
    expect(client.passkeyApprovalVerify).toHaveBeenCalledTimes(1);
    // Without this write, unlock would open the placeholder and show
    // "Wrong master password" even with the correct password.
    expect(localShare).toBe(approved);
    expect(localShare).not.toBe(placeholder);
    expect(writeVaultBundle).toHaveBeenCalledWith(
      expect.objectContaining({ device_share_b64: approved }),
      "user-1",
    );
  });
});
