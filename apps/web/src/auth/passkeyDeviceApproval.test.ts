import { beforeEach, describe, expect, it, vi } from "vitest";

const startAuthentication = vi.hoisted(() => vi.fn());
const sealPasskeyShareWrap = vi.hoisted(() => vi.fn(async () => new Uint8Array([1, 2, 3])));
const openPasskeyShareWrap = vi.hoisted(() => vi.fn(async () => new Uint8Array(32).fill(7)));

vi.mock("@simplewebauthn/browser", () => ({
  startAuthentication,
}));

vi.mock("@okkey/crypto", () => ({
  initCrypto: vi.fn(async () => undefined),
  sealPasskeyShareWrap,
  openPasskeyShareWrap,
  wipeBytes: vi.fn(),
}));

import {
  approvePendingDeviceWithPasskey,
  establishPasskeyShareWrap,
} from "./passkeyDeviceApproval";

const salt = Buffer.alloc(32, 3).toString("base64");
const prf = Buffer.alloc(32, 5).toString("base64url");

function core() {
  return {
    passkeyShareWrapOptions: vi.fn(async () => ({
      challengeId: "wrap-challenge",
      options: { challenge: "abc" },
      prf_salt: salt,
      credential_id: "cred-webauthn",
    })),
    passkeyShareWrapVerify: vi.fn(
      async (
        _credentialId: string,
        _body: { share_wrap: string; device_share?: string },
      ) => ({
        credential_id: "row-1",
        has_share_wrap: true as const,
      }),
    ),
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
    })),
    passkeyApprovalVerify: vi.fn(
      async (_deviceId: string, _body: { device_share: string }) => ({
        device_id: "42",
        status: "trusted" as const,
      }),
    ),
  };
}

describe("passkey device approval client", () => {
  beforeEach(() => {
    startAuthentication.mockReset();
    sealPasskeyShareWrap.mockClear();
    openPasskeyShareWrap.mockClear();
  });

  it("does not upload a wrap when the authenticator returns no PRF result", async () => {
    startAuthentication.mockResolvedValue({
      id: "cred-webauthn",
      clientExtensionResults: {},
    });
    const client = core();
    const result = await establishPasskeyShareWrap(client as never, {
      credentialRowId: "row-1",
      deviceShare: new Uint8Array(32).fill(8),
    });
    expect(result).toEqual({ ok: false, code: "prf_unavailable" });
    expect(client.passkeyShareWrapVerify).not.toHaveBeenCalled();
  });

  it("does not send a device share when approval PRF is missing", async () => {
    startAuthentication.mockResolvedValue({
      id: "cred-webauthn",
      clientExtensionResults: {},
    });
    const client = core();
    const result = await approvePendingDeviceWithPasskey(client as never, "42");
    expect(result).toEqual({ ok: false, code: "prf_unavailable" });
    expect(client.passkeyApprovalVerify).not.toHaveBeenCalled();
    expect(openPasskeyShareWrap).not.toHaveBeenCalled();
  });

  it("sends the unwrapped share and not a server-copied share", async () => {
    startAuthentication.mockResolvedValue({
      id: "cred-webauthn",
      clientExtensionResults: { prf: { results: { first: prf } } },
    });
    const client = core();
    const result = await approvePendingDeviceWithPasskey(client as never, "42");
    expect(result).toEqual({ ok: true });
    expect(client.passkeyApprovalVerify).toHaveBeenCalledTimes(1);
    const body = client.passkeyApprovalVerify.mock.calls[0]?.[1];
    if (!body) {
      throw new Error("missing verify body");
    }
    expect(body.device_share).toBe(Buffer.alloc(32, 7).toString("base64"));
  });

  it("uploads a wrap built from the local share when PRF succeeds", async () => {
    startAuthentication.mockResolvedValue({
      id: "cred-webauthn",
      clientExtensionResults: { prf: { results: { first: prf } } },
    });
    const client = core();
    const result = await establishPasskeyShareWrap(client as never, {
      credentialRowId: "row-1",
      deviceShare: new Uint8Array(32).fill(8),
    });
    expect(result).toEqual({ ok: true });
    expect(sealPasskeyShareWrap).toHaveBeenCalledTimes(1);
    const saved = client.passkeyShareWrapVerify.mock.calls[0]?.[1];
    if (!saved) {
      throw new Error("missing wrap body");
    }
    expect(saved.share_wrap).toBeTruthy();
    expect(saved.device_share).toBeUndefined();
  });
});
