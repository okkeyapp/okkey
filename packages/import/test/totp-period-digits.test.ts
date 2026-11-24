import { describe, expect, it } from "vitest";

import { mapImportResultToOkkeyItems } from "../src/mappers/to-okkey-item.js";
import { runImport } from "../src/registry.js";
import { CipherType } from "../src/types/enums.js";
import { ImportResult } from "../src/types/import-result.js";
import { CipherView, LoginView } from "../src/types/views/cipher.view.js";
import {
  DEFAULT_TOTP_DIGITS,
  DEFAULT_TOTP_PERIOD_SECONDS,
  parseTotpParams,
} from "../src/utils/totp.js";

const RFC_SECRET = "JBSWY3DPEHPK3PXP";
const NON_DEFAULT_URI = `otpauth://totp/QA:test@example.com?secret=${RFC_SECRET}&issuer=QA&period=60&digits=8`;

function findTotpValue(
  draft: ReturnType<typeof mapImportResultToOkkeyItems>[number] | undefined,
) {
  return draft?.item.fields.find((field) => field.type === "totp" || field.id === "totp")?.value;
}

function expectTotpPeriodDigits(
  draft: ReturnType<typeof mapImportResultToOkkeyItems>[number] | undefined,
  expected: { secretBase32: string; periodSeconds: number; digits: number },
) {
  expect(findTotpValue(draft)).toMatchObject({
    kind: "totp",
    secretBase32: expected.secretBase32,
    periodSeconds: expected.periodSeconds,
    digits: expected.digits,
  });
}

describe("parseTotpParams", () => {
  it("reads period and digits from otpauth URIs", () => {
    expect(parseTotpParams(NON_DEFAULT_URI)).toMatchObject({
      secretBase32: RFC_SECRET,
      periodSeconds: 60,
      digits: 8,
    });
  });

  it("defaults bare secrets to RFC period and digits", () => {
    expect(parseTotpParams(RFC_SECRET)).toMatchObject({
      secretBase32: RFC_SECRET,
      periodSeconds: DEFAULT_TOTP_PERIOD_SECONDS,
      digits: DEFAULT_TOTP_DIGITS,
    });
  });

  it("falls back when period or digits are non-integers or out of range", () => {
    expect(
      parseTotpParams(`otpauth://totp/QA?secret=${RFC_SECRET}&period=1.5&digits=6.5`),
    ).toMatchObject({
      secretBase32: RFC_SECRET,
      periodSeconds: DEFAULT_TOTP_PERIOD_SECONDS,
      digits: DEFAULT_TOTP_DIGITS,
    });
    expect(
      parseTotpParams(`otpauth://totp/QA?secret=${RFC_SECRET}&period=0&digits=12`),
    ).toMatchObject({
      secretBase32: RFC_SECRET,
      periodSeconds: DEFAULT_TOTP_PERIOD_SECONDS,
      digits: DEFAULT_TOTP_DIGITS,
    });
    expect(
      parseTotpParams(`otpauth://totp/QA?secret=${RFC_SECRET}&period=-30&digits=100`),
    ).toMatchObject({
      secretBase32: RFC_SECRET,
      periodSeconds: DEFAULT_TOTP_PERIOD_SECONDS,
      digits: DEFAULT_TOTP_DIGITS,
    });
    expect(
      parseTotpParams(`otpauth://totp/QA?secret=${RFC_SECRET}&period=60&digits=5`),
    ).toMatchObject({
      secretBase32: RFC_SECRET,
      periodSeconds: 60,
      digits: DEFAULT_TOTP_DIGITS,
    });
    expect(
      parseTotpParams(`otpauth://totp/QA?secret=${RFC_SECRET}&period=60&digits=10`),
    ).toMatchObject({
      secretBase32: RFC_SECRET,
      periodSeconds: 60,
      digits: 10,
    });
  });

  it("parses KeeOtp key/step/size/otpHashMode without trailing junk on the secret", () => {
    const keeOtp = `key=${RFC_SECRET}&step=60&size=8&otpHashMode=Sha256`;
    expect(parseTotpParams(keeOtp)).toMatchObject({
      secretBase32: RFC_SECRET,
      periodSeconds: 60,
      digits: 8,
      algorithm: "SHA256",
    });
  });
});

describe("import preserves TOTP period and digits", () => {
  it("maps Bitwarden JSON otpauth with 60 s / 8 digits", async () => {
    const payload = JSON.stringify({
      encrypted: false,
      folders: [],
      items: [
        {
          id: "login-totp",
          type: 1,
          name: "Bitwarden TOTP",
          login: {
            username: "user",
            password: "pass",
            totp: NON_DEFAULT_URI,
            uris: [{ uri: "https://example.com" }],
          },
        },
      ],
    });
    const result = await runImport("bitwardenjson", payload);
    const mapped = mapImportResultToOkkeyItems({ result, vaultId: "vault-demo" });
    expectTotpPeriodDigits(mapped[0], {
      secretBase32: RFC_SECRET,
      periodSeconds: 60,
      digits: 8,
    });
  });

  it("maps Bitwarden CSV otpauth with 60 s / 8 digits", async () => {
    const csv = [
      "folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,login_totp",
      `,,login,Bitwarden CSV TOTP,,,,https://example.com,user,pass,${NON_DEFAULT_URI}`,
    ].join("\n");
    const result = await runImport("bitwardencsv", csv);
    const mapped = mapImportResultToOkkeyItems({ result, vaultId: "vault-demo" });
    expectTotpPeriodDigits(mapped[0], {
      secretBase32: RFC_SECRET,
      periodSeconds: 60,
      digits: 8,
    });
  });

  it("maps LastPass CSV otpauth with 60 s / 8 digits", async () => {
    const csv = [
      "url,username,password,totp,extra,name,grouping,fav",
      `https://example.com,user,pass,${NON_DEFAULT_URI},,LastPass TOTP,,0`,
    ].join("\n");
    const result = await runImport("lastpasscsv", csv);
    const mapped = mapImportResultToOkkeyItems({ result, vaultId: "vault-demo" });
    expectTotpPeriodDigits(mapped[0], {
      secretBase32: RFC_SECRET,
      periodSeconds: 60,
      digits: 8,
    });
  });

  it("maps 1Password CSV OTPAuth with 60 s / 8 digits", async () => {
    const csv = [
      "Title,Url,Username,Password,OTPAuth,Notes",
      `1Password CSV TOTP,https://example.com,user,pass,${NON_DEFAULT_URI},`,
    ].join("\n");
    const result = await runImport("onepasswordcsv", csv);
    const mapped = mapImportResultToOkkeyItems({ result, vaultId: "vault-demo" });
    expectTotpPeriodDigits(mapped[0], {
      secretBase32: RFC_SECRET,
      periodSeconds: 60,
      digits: 8,
    });
  });

  it("maps Safari CSV OTPAuth with 60 s / 8 digits", async () => {
    const csv = [
      "Title,URL,Username,Password,OTPAuth,Notes",
      `Safari TOTP,https://example.com,user,pass,${NON_DEFAULT_URI},`,
    ].join("\n");
    const result = await runImport("safaricsv", csv);
    const mapped = mapImportResultToOkkeyItems({ result, vaultId: "vault-demo" });
    expectTotpPeriodDigits(mapped[0], {
      secretBase32: RFC_SECRET,
      periodSeconds: 60,
      digits: 8,
    });
  });

  it("maps KeePass otpauth otp field with 60 s / 8 digits", () => {
    // KeePass2XmlImporter stores the raw otp value; DOMParser is browser-only, so
    // exercise the same post-parse string through the Okkey mapper.
    const result = new ImportResult();
    result.success = true;
    const cipher = new CipherView();
    cipher.type = CipherType.Login;
    cipher.name = "KeePass TOTP";
    cipher.login = new LoginView();
    cipher.login.totp = NON_DEFAULT_URI;
    result.ciphers.push(cipher);

    const mapped = mapImportResultToOkkeyItems({ result, vaultId: "vault-demo" });
    expectTotpPeriodDigits(mapped[0], {
      secretBase32: RFC_SECRET,
      periodSeconds: 60,
      digits: 8,
    });
  });

  it("maps KeePass KeeOtp otp field with step/size (60 s / 8 digits)", () => {
    const keeOtp = `key=${RFC_SECRET}&step=60&size=8&otpHashMode=Sha1`;
    const result = new ImportResult();
    result.success = true;
    const cipher = new CipherView();
    cipher.type = CipherType.Login;
    cipher.name = "KeePass KeeOtp";
    cipher.login = new LoginView();
    cipher.login.totp = keeOtp;
    result.ciphers.push(cipher);

    const mapped = mapImportResultToOkkeyItems({ result, vaultId: "vault-demo" });
    expect(findTotpValue(mapped[0])).toMatchObject({
      kind: "totp",
      secretBase32: RFC_SECRET,
      periodSeconds: 60,
      digits: 8,
      algorithm: "SHA1",
    });
  });

  it("maps 1Password 1PUX section totp with 60 s / 8 digits", async () => {
    const payload = JSON.stringify({
      accounts: [
        {
          vaults: [
            {
              attrs: { name: "Private" },
              items: [
                {
                  state: "active",
                  categoryUuid: "001",
                  overview: { title: "1PUX TOTP", url: "https://example.com" },
                  details: {
                    loginFields: [
                      { designation: "username", value: "user" },
                      { designation: "password", value: "pass" },
                    ],
                    sections: [
                      {
                        title: "",
                        fields: [
                          {
                            title: "one-time password",
                            value: { totp: NON_DEFAULT_URI },
                          },
                        ],
                      },
                    ],
                  },
                },
              ],
            },
          ],
        },
      ],
    });
    const result = await runImport("onepassword1pux", payload);
    const mapped = mapImportResultToOkkeyItems({ result, vaultId: "vault-demo" });
    expectTotpPeriodDigits(mapped[0], {
      secretBase32: RFC_SECRET,
      periodSeconds: 60,
      digits: 8,
    });
  });
});
