import { describe, expect, it } from "vitest";

import type { KeyFormEditorSection } from "../key-form/KeyFormEditor.js";
import { itemPlaintextToKeyFormSections } from "./itemPlaintextToKeyFormSections.js";
import { keyFormSectionsToItemPlaintext } from "./keyFormToItemPlaintext.js";

/** RFC 6238 Appendix B secret "12345678901234567890" as Base32. */
const RFC_SECRET_BASE32 = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

function loginSectionsWithTotp(input: {
  value: string;
  totpPeriodSeconds?: number;
  totpDigits?: number;
  totpAlgorithm?: "SHA1" | "SHA256" | "SHA512";
}): KeyFormEditorSection[] {
  return [
    {
      id: "credentials",
      variant: "primary",
      fields: [
        {
          id: "login",
          type: "text",
          label: "Username",
          value: "user@example.com",
          deletable: false,
          editableLabel: false,
        },
        {
          id: "password",
          type: "password",
          label: "Password",
          value: "secret",
          deletable: false,
          editableLabel: false,
          secret: true,
        },
        {
          id: "one-time-password",
          type: "totp",
          label: "One-time password",
          value: input.value,
          deletable: true,
          editableLabel: true,
          ...(input.totpPeriodSeconds !== undefined
            ? { totpPeriodSeconds: input.totpPeriodSeconds }
            : {}),
          ...(input.totpDigits !== undefined ? { totpDigits: input.totpDigits } : {}),
          ...(input.totpAlgorithm !== undefined ? { totpAlgorithm: input.totpAlgorithm } : {}),
        },
      ],
    },
  ];
}

function totpValueFromItem(
  item: ReturnType<typeof keyFormSectionsToItemPlaintext>,
): Extract<(typeof item.fields)[number]["value"], { kind: "totp" }> {
  const field = item.fields.find((candidate) => candidate.id === "one-time-password");
  expect(field?.value.kind).toBe("totp");
  if (field?.value.kind !== "totp") {
    throw new Error("expected totp field");
  }
  return field.value;
}

describe("TOTP period and digits round-trip on save (#133)", () => {
  it.each([
    { periodSeconds: 30, digits: 6 },
    { periodSeconds: 30, digits: 8 },
    { periodSeconds: 60, digits: 6 },
    { periodSeconds: 60, digits: 8 },
  ] as const)(
    "persists otpauth:// period=$periodSeconds digits=$digits instead of hard-coded 30/6",
    ({ periodSeconds, digits }) => {
      const uri = `otpauth://totp/Example:user@example.com?secret=${RFC_SECRET_BASE32}&period=${periodSeconds}&digits=${digits}&algorithm=SHA1`;
      const item = keyFormSectionsToItemPlaintext({
        sections: loginSectionsWithTotp({
          // Form defaults before paste would be 30/6; URI params must win on save.
          value: uri,
          totpPeriodSeconds: 30,
          totpDigits: 6,
        }),
        itemId: "item-totp-1",
        vaultId: "vault-1",
        title: "Example",
        categoryId: "login",
        nowMs: 1,
      });

      expect(totpValueFromItem(item)).toEqual({
        kind: "totp",
        secretBase32: RFC_SECRET_BASE32,
        periodSeconds,
        digits,
        algorithm: "SHA1",
      });
    },
  );

  it.each([
    { periodSeconds: 30, digits: 6 },
    { periodSeconds: 30, digits: 8 },
    { periodSeconds: 60, digits: 6 },
    { periodSeconds: 60, digits: 8 },
  ] as const)(
    "round-trips period=$periodSeconds digits=$digits through save → edit → save",
    ({ periodSeconds, digits }) => {
      const uri = `otpauth://totp/Example:user@example.com?secret=${RFC_SECRET_BASE32}&period=${periodSeconds}&digits=${digits}&algorithm=SHA256`;

      const firstSave = keyFormSectionsToItemPlaintext({
        sections: loginSectionsWithTotp({ value: uri }),
        itemId: "item-totp-2",
        vaultId: "vault-1",
        title: "Example",
        categoryId: "login",
        nowMs: 1,
      });

      expect(totpValueFromItem(firstSave)).toMatchObject({
        secretBase32: RFC_SECRET_BASE32,
        periodSeconds,
        digits,
        algorithm: "SHA256",
      });

      const restored = itemPlaintextToKeyFormSections(firstSave, undefined, {
        includeEmptyFields: true,
      });
      const totpField = restored
        .flatMap((section) => section.fields)
        .find((field) => field.id === "one-time-password");

      expect(totpField).toMatchObject({
        type: "totp",
        value: RFC_SECRET_BASE32,
        totpPeriodSeconds: periodSeconds,
        totpDigits: digits,
        totpAlgorithm: "SHA256",
      });

      // Second save uses the bare secret plus form metadata (typical after reopen).
      const secondSave = keyFormSectionsToItemPlaintext({
        sections: restored,
        itemId: "item-totp-2",
        vaultId: "vault-1",
        title: "Example",
        categoryId: "login",
        nowMs: 2,
      });

      expect(totpValueFromItem(secondSave)).toEqual({
        kind: "totp",
        secretBase32: RFC_SECRET_BASE32,
        periodSeconds,
        digits,
        algorithm: "SHA256",
      });
    },
  );

  it("keeps non-default stored metadata when a bare secret is edited without an otpauth URI", () => {
    const item = keyFormSectionsToItemPlaintext({
      sections: loginSectionsWithTotp({
        value: RFC_SECRET_BASE32,
        totpPeriodSeconds: 60,
        totpDigits: 8,
        totpAlgorithm: "SHA512",
      }),
      itemId: "item-totp-3",
      vaultId: "vault-1",
      title: "Example",
      categoryId: "login",
      nowMs: 1,
    });

    expect(totpValueFromItem(item)).toEqual({
      kind: "totp",
      secretBase32: RFC_SECRET_BASE32,
      periodSeconds: 60,
      digits: 8,
      algorithm: "SHA512",
    });
  });
});
