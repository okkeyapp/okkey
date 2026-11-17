import { beforeEach, describe, expect, it, vi } from "vitest";

const startAuthentication = vi.hoisted(() => vi.fn());
const sealPasskeyShareWrap = vi.hoisted(() => vi.fn(async () => new Uint8Array([1, 2, 3])));
const openPasskeyShareWrap = vi.hoisted(() => vi.fn(async () => new Uint8Array(32).fill(7)));
const openStoredSplitKeyShareB = vi.hoisted(() =>
  vi.fn(async ({ stored }: { stored: Uint8Array }) => stored.slice()),
);
const wrapSplitKeyShareB = vi.hoisted(() =>
  vi.fn(async () => new Uint8Array([9, 9, 9, 9])),
);
const classifySplitKeyShareBWire = vi.hoisted(() =>
  vi.fn((bytes: Uint8Array) => (bytes.length === 32 ? "legacy" : "hybrid")),
);
const loadSplitKeyShareWrapKey = vi.hoisted(() => vi.fn(async () => null));

vi.mock("@simplewebauthn/browser", () => ({
  startAuthentication,
}));

vi.mock("@okkey/crypto", () => ({
  initCrypto: vi.fn(async () => undefined),
  sealPasskeyShareWrap,
  openPasskeyShareWrap,
  openStoredSplitKeyShareB,
  wrapSplitKeyShareB,
  classifySplitKeyShareBWire,
  wipeBytes: vi.fn(),
}));

vi.mock("@okkey/vault", () => ({
  loadSplitKeyShareWrapKey,
}));

import {
  approvePendingDeviceWithPasskey,
  establishPasskeyShareWrap,
} from "./passkeyDeviceApproval";

const salt = Buffer.alloc(32, 3).toString("base64");
const prf = Buffer.alloc(32, 5).toString("base64url");
const wrapEd = Buffer.alloc(32, 11).toString("base64");
const wrapPq = Buffer.alloc(32, 12).toString("base64");

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
      share_wrap_ed25519_public_key: wrapEd,
      share_wrap_pq_public_key: wrapPq,
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
    openStoredSplitKeyShareB.mockClear();
    wrapSplitKeyShareB.mockClear();
    classifySplitKeyShareBWire.mockClear();
    loadSplitKeyShareWrapKey.mockClear();
    openPasskeyShareWrap.mockResolvedValue(new Uint8Array(32).fill(7));
    classifySplitKeyShareBWire.mockImplementation((bytes: Uint8Array) =>
      bytes.length === 32 ? "legacy" : "hybrid",
    );
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
      userId: "user-1",
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

  it("re-wraps the raw PRF share for the pending device before verify", async () => {
    startAuthentication.mockResolvedValue({
      id: "cred-webauthn",
      clientExtensionResults: { prf: { results: { first: prf } } },
    });
    const client = core();
    const result = await approvePendingDeviceWithPasskey(client as never, "42");
    expect(result).toEqual({ ok: true });
    expect(wrapSplitKeyShareB).toHaveBeenCalledTimes(1);
    expect(client.passkeyApprovalVerify).toHaveBeenCalledTimes(1);
    const body = client.passkeyApprovalVerify.mock.calls[0]?.[1];
    if (!body) {
      throw new Error("missing verify body");
    }
    expect(body.device_share).toBe(Buffer.from([9, 9, 9, 9]).toString("base64"));
    expect(body.device_share).not.toBe(Buffer.alloc(32, 7).toString("base64"));
  });

  it("rejects an outdated hybrid PRF wrap without posting a share", async () => {
    openPasskeyShareWrap.mockResolvedValueOnce(new Uint8Array(200).fill(4));
    startAuthentication.mockResolvedValue({
      id: "cred-webauthn",
      clientExtensionResults: { prf: { results: { first: prf } } },
    });
    const client = core();
    const result = await approvePendingDeviceWithPasskey(client as never, "42");
    expect(result).toEqual({ ok: false, code: "wrap_outdated" });
    expect(client.passkeyApprovalVerify).not.toHaveBeenCalled();
    expect(wrapSplitKeyShareB).not.toHaveBeenCalled();
  });

  it("seals the opened raw local share under PRF when wrap succeeds", async () => {
    startAuthentication.mockResolvedValue({
      id: "cred-webauthn",
      clientExtensionResults: { prf: { results: { first: prf } } },
    });
    const client = core();
    const local = new Uint8Array(32).fill(8);
    const result = await establishPasskeyShareWrap(client as never, {
      credentialRowId: "row-1",
      deviceShare: local,
      userId: "user-1",
    });
    expect(result).toEqual({ ok: true });
    expect(openStoredSplitKeyShareB).toHaveBeenCalledTimes(1);
    expect(sealPasskeyShareWrap).toHaveBeenCalledTimes(1);
    const sealedArg = sealPasskeyShareWrap.mock.calls[0]?.[0] as
      | { deviceShare?: Uint8Array }
      | undefined;
    expect(sealedArg?.deviceShare).toEqual(local);
    const saved = client.passkeyShareWrapVerify.mock.calls[0]?.[1] as
      | { share_wrap?: string; device_share?: string }
      | undefined;
    if (!saved) {
      throw new Error("missing wrap body");
    }
    expect(saved.share_wrap).toBeTruthy();
    expect(saved.device_share).toBeUndefined();
  });
});
