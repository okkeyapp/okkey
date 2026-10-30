import { ITEM_PLAINTEXT_SCHEMA_VERSION_V2 } from "@okkey/types";
import { describe, expect, it } from "vitest";

import { buildBitwardenJsonExport } from "../src/exporters/bitwarden-exporter.js";
import { buildLoginCsvExport } from "../src/exporters/login-csv-exporter.js";
import { buildOkkeyJsonExport } from "../src/exporters/okkey-exporter.js";
import { buildOnePassword1PuxExport } from "../src/exporters/onepassword-1pux-exporter.js";
import { mapImportResultToOkkeyItems } from "../src/mappers/to-okkey-item.js";
import { runImport } from "../src/registry.js";
import { CipherType } from "../src/types/enums.js";
import { ImportResult } from "../src/types/import-result.js";
import { CipherView, LoginView } from "../src/types/views/cipher.view.js";
import {
  DEFAULT_TOTP_ALGORITHM,
  formatTotpForExport,
  parseTotpParams,
} from "../src/utils/totp.js";
import { unzipToMap } from "../src/utils/zip.js";

const RFC_SECRET = "JBSWY3DPEHPK3PXP";
const SHA256_URI = `otpauth://totp/QA:test@example.com?secret=${RFC_SECRET}&issuer=QA&period=60&digits=8&algorithm=SHA256`;
const SHA512_URI = `otpauth://totp/QA:test@example.com?secret=${RFC_SECRET}&issuer=QA&period=30&digits=8&algorithm=SHA512`;

function sampleLoginItem(totp: {
  secretBase32: string;
  periodSeconds: number;
  digits: number;
  algorithm: "SHA1" | "SHA256" | "SHA512";
}) {
  return {
    schemaVersion: ITEM_PLAINTEXT_SCHEMA_VERSION_V2,
    itemId: "item-totp-alg",
    vaultId: "vault-1",
    title: "TOTP Algorithm Login",
    categoryId: "login",
    createdAtMs: 1_700_000_000_000,
    updatedAtMs: 1_700_000_000_100,
    sections: [
      { id: "credentials", title: "General", order: 0, isPreset: true },
      { id: "websites", title: "Websites", order: 1, isPreset: true },
    ],
    fields: [
      {
        id: "login",
        type: "text" as const,
        sectionId: "credentials",
        order: 0,
        label: "Login",
        value: { kind: "text" as const, text: "user@example.com" },
      },
      {
        id: "password",
        type: "password" as const,
        sectionId: "credentials",
        order: 1,
        label: "Password",
        value: { kind: "password" as const, password: "s3cret" },
      },
      {
        id: "totp",
        type: "totp" as const,
        sectionId: "credentials",
        order: 2,
        label: "Authenticator",
        value: {
          kind: "totp" as const,
          secretBase32: totp.secretBase32,
          periodSeconds: totp.periodSeconds,
          digits: totp.digits,
          algorithm: totp.algorithm,
        },
      },
      {
        id: "website-1",
        type: "url" as const,
        sectionId: "websites",
        order: 0,
        label: "Website",
        value: { kind: "url" as const, url: "https://example.com" },
      },
    ],
    tags: [],
  };
}

function findTotpValue(
  draft: ReturnType<typeof mapImportResultToOkkeyItems>[number] | undefined,
) {
  return draft?.item.fields.find((field) => field.type === "totp" || field.id === "totp")?.value;
}

describe("formatTotpForExport", () => {
  it("emits otpauth with period, digits, and algorithm", () => {
    const uri = formatTotpForExport({
      secretBase32: RFC_SECRET,
      periodSeconds: 60,
      digits: 8,
      algorithm: "SHA256",
    });
    expect(parseTotpParams(uri)).toEqual({
      secretBase32: RFC_SECRET,
      periodSeconds: 60,
      digits: 8,
      algorithm: "SHA256",
    });
  });

  it("defaults omitted metadata to RFC SHA1 / 30 s / 6 digits", () => {
    const uri = formatTotpForExport({ secretBase32: RFC_SECRET });
    expect(parseTotpParams(uri)).toEqual({
      secretBase32: RFC_SECRET,
      periodSeconds: 30,
      digits: 6,
      algorithm: DEFAULT_TOTP_ALGORITHM,
    });
  });
});

describe("import preserves TOTP algorithm", () => {
  it("maps Bitwarden JSON otpauth with SHA256", async () => {
    const payload = JSON.stringify({
      encrypted: false,
      folders: [],
      items: [
        {
          id: "login-totp-sha256",
          type: 1,
          name: "Bitwarden SHA256",
          login: {
            username: "user",
            password: "pass",
            totp: SHA256_URI,
            uris: [{ uri: "https://example.com" }],
          },
        },
      ],
    });
    const result = await runImport("bitwardenjson", payload);
    const mapped = mapImportResultToOkkeyItems({ result, vaultId: "vault-demo" });
    expect(findTotpValue(mapped[0])).toMatchObject({
      kind: "totp",
      secretBase32: RFC_SECRET,
      periodSeconds: 60,
      digits: 8,
      algorithm: "SHA256",
    });
  });

  it("maps Bitwarden CSV otpauth with SHA512", async () => {
    const csv = [
      "folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,login_totp",
      `,,login,Bitwarden CSV SHA512,,,,https://example.com,user,pass,${SHA512_URI}`,
    ].join("\n");
    const result = await runImport("bitwardencsv", csv);
    const mapped = mapImportResultToOkkeyItems({ result, vaultId: "vault-demo" });
    expect(findTotpValue(mapped[0])).toMatchObject({
      kind: "totp",
      secretBase32: RFC_SECRET,
      periodSeconds: 30,
      digits: 8,
      algorithm: "SHA512",
    });
  });

  it("maps KeeOtp otpHashMode Sha512", () => {
    const keeOtp = `key=${RFC_SECRET}&step=60&size=8&otpHashMode=Sha512`;
    const result = new ImportResult();
    result.success = true;
    const cipher = new CipherView();
    cipher.type = CipherType.Login;
    cipher.name = "KeePass KeeOtp SHA512";
    cipher.login = new LoginView();
    cipher.login.totp = keeOtp;
    result.ciphers.push(cipher);

    const mapped = mapImportResultToOkkeyItems({ result, vaultId: "vault-demo" });
    expect(findTotpValue(mapped[0])).toMatchObject({
      kind: "totp",
      secretBase32: RFC_SECRET,
      periodSeconds: 60,
      digits: 8,
      algorithm: "SHA512",
    });
  });
});

describe("export preserves TOTP algorithm", () => {
  const totpMeta = {
    secretBase32: RFC_SECRET,
    periodSeconds: 60,
    digits: 8,
    algorithm: "SHA256" as const,
  };

  it("round-trips Bitwarden JSON export → import with SHA256", async () => {
    const bytes = await buildBitwardenJsonExport({
      items: [{ item: sampleLoginItem(totpMeta), folderPath: null, favorite: false }],
    });
    const result = await runImport("bitwardenjson", new TextDecoder().decode(bytes));
    const mapped = mapImportResultToOkkeyItems({ result, vaultId: "vault-demo" });
    expect(findTotpValue(mapped[0])).toMatchObject({
      kind: "totp",
      ...totpMeta,
    });
  });

  it("round-trips LastPass CSV export → import with SHA256", async () => {
    const bytes = buildLoginCsvExport(
      [{ item: sampleLoginItem(totpMeta), folderPath: null, favorite: false }],
      "lastpass",
    );
    const result = await runImport("lastpasscsv", new TextDecoder().decode(bytes));
    const mapped = mapImportResultToOkkeyItems({ result, vaultId: "vault-demo" });
    expect(findTotpValue(mapped[0])).toMatchObject({
      kind: "totp",
      ...totpMeta,
    });
  });

  it("round-trips Safari CSV OTPAuth with SHA256", async () => {
    const bytes = buildLoginCsvExport(
      [{ item: sampleLoginItem(totpMeta), folderPath: null, favorite: false }],
      "safari",
    );
    const result = await runImport("safaricsv", new TextDecoder().decode(bytes));
    const mapped = mapImportResultToOkkeyItems({ result, vaultId: "vault-demo" });
    expect(findTotpValue(mapped[0])).toMatchObject({
      kind: "totp",
      ...totpMeta,
    });
  });

  it("round-trips 1Password 1PUX export → import with SHA256", async () => {
    const zip = buildOnePassword1PuxExport([
      { item: sampleLoginItem(totpMeta), folderPath: null, favorite: false },
    ]);
    const files = await unzipToMap(zip);
    const exportData = new TextDecoder().decode(files.get("export.data")!);
    const result = await runImport("onepassword1pux", exportData);
    const mapped = mapImportResultToOkkeyItems({ result, vaultId: "vault-demo" });
    expect(findTotpValue(mapped[0])).toMatchObject({
      kind: "totp",
      ...totpMeta,
    });
  });

  it("round-trips Okkey JSON native export with SHA512 structured field", async () => {
    const sha512Meta = {
      secretBase32: RFC_SECRET,
      periodSeconds: 30,
      digits: 8,
      algorithm: "SHA512" as const,
    };
    const bytes = await buildOkkeyJsonExport({
      items: [{ item: sampleLoginItem(sha512Meta), folderPath: null, favorite: false }],
    });
    const result = await runImport("okkeyjson", new TextDecoder().decode(bytes));
    expect(result.success).toBe(true);
    const nativeTotp = result.nativeEntries[0]?.item.fields.find(
      (field) => field.type === "totp" || field.id === "totp",
    )?.value;
    expect(nativeTotp).toMatchObject({
      kind: "totp",
      ...sha512Meta,
    });
  });
});
