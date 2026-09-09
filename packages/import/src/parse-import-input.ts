import type { ParsedImportBundle } from "./types/import-result.js";
import { unzipToMap } from "./utils/zip.js";

export type ImportInputMode = "file" | "text";

export async function parseImportInput(input: {
  mode: ImportInputMode;
  text?: string;
  file?: File | null;
  formatId: string;
}): Promise<ParsedImportBundle> {
  if (input.mode === "text") {
    return {
      text: input.text ?? "",
      attachmentFiles: new Map(),
    };
  }

  if (!input.file) {
    return { text: "", attachmentFiles: new Map() };
  }

  const lowerName = input.file.name.toLowerCase();
  if (lowerName.endsWith(".zip") || lowerName.endsWith(".1pux")) {
    const bytes = new Uint8Array(await input.file.arrayBuffer());
    return await parseZipImport(bytes, input.formatId);
  }

  return {
    text: await input.file.text(),
    attachmentFiles: new Map(),
  };
}

export async function parseZipImport(bytes: Uint8Array, formatId: string): Promise<ParsedImportBundle> {
  const files = await unzipToMap(bytes);
  const attachmentFiles = new Map<string, Uint8Array>();

  if (formatId === "okkeyzip" || formatId === "okkeyjson") {
    const jsonEntry =
      files.get("export.json") ??
      files.get("data.json") ??
      [...files.entries()].find(([name]) => name.endsWith(".json"))?.[1];
    if (!jsonEntry) {
      throw new Error("Okkey ZIP does not contain JSON export");
    }
    for (const [name, content] of files.entries()) {
      if (name.startsWith("attachments/") && !name.endsWith("/")) {
        attachmentFiles.set(name, content);
      }
    }
    return {
      text: new TextDecoder().decode(jsonEntry),
      attachmentFiles,
    };
  }

  if (formatId === "onepassword1pux") {
    const dataEntry =
      files.get("export.data") ??
      [...files.entries()].find(([name]) => name.endsWith("export.data") || name.endsWith(".data"))?.[1];
    if (!dataEntry) {
      throw new Error("1Password 1PUX does not contain export.data");
    }
    for (const [name, content] of files.entries()) {
      if (name.startsWith("files/") && !name.endsWith("/")) {
        attachmentFiles.set(name, content);
      }
    }
    return {
      text: new TextDecoder().decode(dataEntry),
      attachmentFiles,
    };
  }

  if (formatId === "bitwardenzip" || formatId === "bitwardenjson") {
    const jsonEntry =
      files.get("data.json") ??
      files.get("export.json") ??
      [...files.entries()].find(([name]) => name.endsWith(".json"))?.[1];
    if (!jsonEntry) {
      throw new Error("Bitwarden ZIP does not contain JSON export");
    }
    for (const [name, content] of files.entries()) {
      if (name.startsWith("attachments/") && !name.endsWith("/")) {
        attachmentFiles.set(name, content);
      }
    }
    return {
      text: new TextDecoder().decode(jsonEntry),
      attachmentFiles,
    };
  }

  if (formatId === "yandexzip") {
    const csvEntry =
      files.get("Passwords.csv") ??
      files.get("passwords.csv") ??
      [...files.entries()].find(([name]) => name.toLowerCase().endsWith(".csv"))?.[1];
    if (!csvEntry) {
      throw new Error("Yandex ZIP does not contain passwords CSV");
    }
    return {
      text: new TextDecoder().decode(csvEntry),
      attachmentFiles,
    };
  }

  const firstText = [...files.entries()].find(([name]) => /\.(json|csv|xml|txt|data)$/i.test(name));
  if (!firstText) {
    throw new Error("ZIP archive does not contain a supported text export");
  }
  return {
    text: new TextDecoder().decode(firstText[1]),
    attachmentFiles,
  };
}
