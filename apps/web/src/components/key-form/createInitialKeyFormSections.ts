import { serializeKeyFieldRecoveryCodesValue } from "@okkey/ui";

import type { KeyFormEditorSection } from "./KeyFormEditor";

function createDemoRecoveryCodesValue(): string {
  const codes = [
    "a1b2c3d4e5",
    "f6g7h8i9j0",
    "k1l2m3n4o5",
    "p6q7r8s9t0",
    "u1v2w3x4y5",
    "z6a7b8c9d0",
    "e1f2g3h4i5",
    "j6k7l8m9n0",
    "o1p2q3r4s5",
    "t6u7v8w9x0",
  ].map((code, index) => ({ code, used: index < 2 }));

  return serializeKeyFieldRecoveryCodesValue(codes);
}

export function createInitialKeyFormSections(): KeyFormEditorSection[] {
  return [
    {
      id: "credentials",
      variant: "primary",
      fields: [
        { id: "login", type: "username", label: "login", value: "shadcn@vercel.com", copyValue: "shadcn@vercel.com" },
        {
          id: "password",
          type: "password",
          label: "password",
          value: "correct-horse-battery-staple",
          copyValue: "correct-horse-battery-staple",
          secret: true,
        },
        {
          id: "totp",
          type: "totp",
          label: "one-time password (totp)",
          value: "JBSWY3DPEHPK3PXP",
          copyValue: "",
        },
      ],
    },
    {
      id: "websites",
      variant: "primary",
      fields: [
        {
          id: "website-ru",
          type: "url",
          label: "website URL",
          value: "https://yandex.ru",
          copyValue: "https://yandex.ru",
          editableLabel: true,
        },
        {
          id: "website-com",
          type: "url",
          label: "international website URL",
          value: "https://yandex.com",
          copyValue: "https://yandex.com",
          editableLabel: true,
        },
      ],
    },
    {
      id: "api-keys",
      variant: "additional",
      title: "API keys",
      fields: [
        {
          id: "recovery-codes",
          type: "recovery-codes",
          label: "recovery codes",
          value: createDemoRecoveryCodesValue(),
          editableLabel: true,
        },
      ],
    },
    {
      id: "attachments",
      variant: "additional",
      title: "Attachments",
      fields: [
        {
          id: "attachment",
          type: "file",
          label: "file",
          value: "",
          editableLabel: true,
        },
      ],
    },
  ];
}
