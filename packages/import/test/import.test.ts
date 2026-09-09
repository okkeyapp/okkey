import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { mapImportResultToOkkeyItems } from "../src/mappers/to-okkey-item.js";
import { parseZipImport } from "../src/parse-import-input.js";
import { runImport } from "../src/registry.js";
import {
  decryptBitwardenPasswordProtectedExport,
  isBitwardenPasswordProtected,
  looksLikeBitwardenPasswordProtectedJson,
} from "../src/utils/bitwarden-password-protected.js";
import { createZipFromFiles, unzipToMap } from "../src/utils/zip.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesRoot = path.join(__dirname, "fixtures");

function readFixture(relativePath: string): string {
  return readFileSync(path.join(fixturesRoot, relativePath), "utf8");
}

function readFixtureBytes(relativePath: string): Uint8Array {
  return new Uint8Array(readFileSync(path.join(fixturesRoot, relativePath)));
}

describe("import parsers", () => {
  it("parses Bitwarden JSON", async () => {
    const result = await runImport("bitwardenjson", readFixture("bitwarden/unencrypted.json"));
    expect(result.success).toBe(true);
    expect(result.ciphers.length).toBe(8);
  });

  it("parses Chrome CSV", async () => {
    const result = await runImport("chromecsv", readFixture("chrome/passwords.csv"));
    expect(result.success).toBe(true);
    expect(result.ciphers.length).toBe(2);
  });

  it("parses Kaspersky TXT", async () => {
    const result = await runImport("kasperskytxt", readFixture("kaspersky/export.txt"));
    expect(result.success).toBe(true);
    expect(result.ciphers.length).toBeGreaterThanOrEqual(2);
  });

  it("parses Passwork JSON", async () => {
    const result = await runImport("passworkjson", readFixture("passwork/export.json"));
    expect(result.success).toBe(true);
    expect(result.ciphers.length).toBe(1);
  });
});

describe("okkey mapper", () => {
  it("maps login items to UI preset field ids", async () => {
    const result = await runImport("chromecsv", readFixture("chrome/passwords.csv"));
    const mapped = mapImportResultToOkkeyItems({
      result,
      vaultId: "vault-demo",
    });
    expect(mapped[0]?.item.categoryId).toBe("login");
    expect(mapped[0]?.item.fields.find((field) => field.id === "password")?.value).toMatchObject({
      kind: "password",
      password: "ChromePass1",
    });
    expect(mapped[0]?.item.fields.find((field) => field.id === "login")?.value).toMatchObject({
      kind: "text",
    });
    expect(mapped[0]?.item.fields.find((field) => field.id === "website-1")?.value).toMatchObject({
      kind: "url",
    });
  });

  it("maps Bitwarden login/card/note/identity with preset fields and custom section", async () => {
    const result = await runImport("bitwardenjson", readFixture("bitwarden/unencrypted.json"));
    const mapped = mapImportResultToOkkeyItems({
      result,
      vaultId: "vault-demo",
    });

    const login = mapped.find((draft) => draft.item.title === "Full Login")?.item;
    expect(login?.categoryId).toBe("login");
    expect(login?.fields.find((field) => field.id === "login")?.value).toMatchObject({
      kind: "text",
      text: "user@example.com",
    });
    expect(login?.fields.find((field) => field.id === "password")?.value).toMatchObject({
      kind: "password",
      password: "Secret123!",
    });
    expect(login?.fields.find((field) => field.id === "website-1")?.value).toMatchObject({
      kind: "url",
      url: "https://example.com",
    });
    expect(login?.fields.find((field) => field.id === "website-2")?.value).toMatchObject({
      kind: "url",
      url: "https://app.example.com/login",
    });
    expect(login?.fields.find((field) => field.id === "website-3")?.value).toMatchObject({
      kind: "url",
      url: "https://m.example.com",
    });
    expect(login?.fields.find((field) => field.id === "totp")?.value).toMatchObject({
      kind: "totp",
    });
    expect(login?.sections.some((section) => section.id === "additional")).toBe(true);
    expect(login?.fields.some((field) => field.label === "Recovery email")).toBe(true);

    const card = mapped.find((draft) => draft.item.title === "Full Card")?.item;
    expect(card?.categoryId).toBe("credit_card");
    expect(card?.fields.find((field) => field.id === "card-number")?.value).toMatchObject({
      kind: "text",
      text: "4111111111111111",
    });
    expect(card?.fields.find((field) => field.id === "card-expiry")?.value).toMatchObject({
      kind: "text",
      text: "12 / 28",
    });
    expect(card?.fields.find((field) => field.id === "card-pin")?.value).toMatchObject({
      kind: "password",
      password: "123",
    });
    expect(card?.fields.find((field) => field.id === "card-holder")?.value).toMatchObject({
      kind: "text",
      text: "Demo User",
    });

    const note = mapped.find((draft) => draft.item.title === "Full Secure Note")?.item;
    expect(note?.categoryId).toBe("secure_note");
    expect(note?.fields.find((field) => field.id === "note")?.value).toMatchObject({
      kind: "note",
    });

    const identity = mapped.find((draft) => draft.item.title === "Full Identity")?.item;
    expect(identity?.categoryId).toBe("personal_data");
    expect(identity?.fields.find((field) => field.id === "first-name")?.value).toMatchObject({
      kind: "text",
      text: "Demo",
    });

    const ssh = mapped.find((draft) => draft.item.title === "Full SSH Key")?.item;
    expect(ssh?.categoryId).toBe("secure_note");
    expect(ssh?.fields.some((field) => field.label === "Private key")).toBe(true);

    expect(result.folders.map((folder) => folder.name)).toEqual(
      expect.arrayContaining(["Work", "Work/Dev", "Work/Dev/API", "Personal", "Personal/Finance", "Archive"]),
    );
  });

  it("resolves Bitwarden ZIP attachments onto login drafts", async () => {
    const bundle = await parseZipImport(
      readFixtureBytes("bitwarden/export-with-attachments.zip"),
      "bitwardenzip",
    );
    const result = await runImport("bitwardenzip", bundle.text);
    const mapped = mapImportResultToOkkeyItems({
      result,
      vaultId: "vault-demo",
      attachmentFiles: bundle.attachmentFiles,
    });
    const login = mapped.find((draft) => draft.item.title === "Login with attachment");
    expect(login?.attachments.length).toBe(1);
    expect(login?.attachments[0]?.fileName).toBe("demo.pdf");
  });

  it("parses deflated Bitwarden ZIP fixture with attachments", async () => {
    const bundle = await parseZipImport(
      readFixtureBytes("bitwarden/export-with-attachments.zip"),
      "bitwardenzip",
    );
    expect(bundle.attachmentFiles.has("attachments/att-1/demo.pdf")).toBe(true);
    expect(bundle.text).toContain("Login with attachment");
  });
});

describe("zip utils", () => {
  it("round-trips store entries and inflates deflated fixture", async () => {
    const packed = createZipFromFiles({
      "data.json": '{"ok":true}',
      "attachments/a/file.txt": "hello",
    });
    const files = await unzipToMap(packed);
    expect(new TextDecoder().decode(files.get("data.json")!)).toBe('{"ok":true}');
    expect(new TextDecoder().decode(files.get("attachments/a/file.txt")!)).toBe("hello");

    const deflated = await unzipToMap(readFixtureBytes("bitwarden/export-with-attachments.zip"));
    expect(deflated.has("data.json")).toBe(true);
    expect(deflated.has("attachments/att-1/demo.pdf")).toBe(true);
  });
});

describe("bitwarden password-protected detection", () => {
  it("detects password-protected export shape", () => {
    const sample = JSON.stringify({
      encrypted: true,
      passwordProtected: true,
      salt: "abc",
      kdfType: 0,
      kdfIterations: 600000,
      encKeyValidation_DO_NOT_EDIT: "2.a|b|c",
      data: "2.a|b|c",
    });
    expect(looksLikeBitwardenPasswordProtectedJson(sample)).toBe(true);
    expect(looksLikeBitwardenPasswordProtectedJson(readFixture("bitwarden/unencrypted.json"))).toBe(
      false,
    );
  });

  it("decrypts password-protected fixture", async () => {
    const parsed = JSON.parse(readFixture("bitwarden/password-protected.json")) as unknown;
    expect(isBitwardenPasswordProtected(parsed)).toBe(true);
    if (!isBitwardenPasswordProtected(parsed)) {
      return;
    }
    const clear = await decryptBitwardenPasswordProtectedExport(parsed, "1234");
    const result = await runImport("bitwardenjson", clear);
    expect(result.success).toBe(true);
    expect(result.ciphers.length).toBe(8);

    await expect(
      decryptBitwardenPasswordProtectedExport(parsed, "wrong-password"),
    ).rejects.toMatchObject({ code: "IMPORT_INVALID_PASSWORD" });
  });
});
