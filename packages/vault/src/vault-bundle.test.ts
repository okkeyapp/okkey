import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  mapVaultUnlockBootstrapToStored,
  omitServerKeyShare,
  parseStoredVaultBundle,
} from "./vault-bundle.ts";

const encrypted = {
  crypto_version: 2,
  algorithm: "opaque",
  payload: "cGF5bG9hZA",
  meta: {},
};

const deviceFields = {
  device_share_b64: "ZGV2aWNl",
  password_kdf_salt_b64: "c2FsdA",
  password_kdf_params_version: 2,
  encrypted_private_key: encrypted,
};

describe("parseStoredVaultBundle", () => {
  it("accepts device material without a server share", () => {
    const parsed = parseStoredVaultBundle(deviceFields);
    assert.ok(parsed);
    assert.equal(parsed.server_key_share_b64, undefined);
    assert.equal(parsed.device_share_b64, "ZGV2aWNl");
  });

  it("keeps a legacy server share so an offline unlock can still run", () => {
    const parsed = parseStoredVaultBundle({
      ...deviceFields,
      server_key_share_b64: "c2VydmVy",
    });
    assert.equal(parsed?.server_key_share_b64, "c2VydmVy");
  });

  it("treats a blank server share as absent", () => {
    const parsed = parseStoredVaultBundle({
      ...deviceFields,
      server_key_share_b64: "   ",
    });
    assert.equal(parsed?.server_key_share_b64, undefined);
  });

  it("rejects a record that is missing the device share", () => {
    assert.equal(parseStoredVaultBundle({ ...deviceFields, device_share_b64: "" }), null);
  });
});

describe("omitServerKeyShare", () => {
  it("removes the server share and leaves device material", () => {
    const stored = omitServerKeyShare({
      ...deviceFields,
      server_key_share_b64: "c2VydmVy",
    });
    assert.equal(JSON.stringify(stored).includes("server_key_share"), false);
    assert.equal(stored.device_share_b64, deviceFields.device_share_b64);
    assert.equal(stored.password_kdf_salt_b64, deviceFields.password_kdf_salt_b64);
  });
});

describe("mapVaultUnlockBootstrapToStored", () => {
  it("carries the server share on the in-memory object", () => {
    const bundle = mapVaultUnlockBootstrapToStored({
      server_key_share: "c2VydmVy",
      ...deviceFields,
    });
    assert.equal(bundle.server_key_share_b64, "c2VydmVy");
    assert.equal(omitServerKeyShare(bundle).server_key_share_b64, undefined);
  });
});
