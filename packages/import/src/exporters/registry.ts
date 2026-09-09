import type { ExportSourceItem } from "./okkey-exporter.js";
import {
  buildOkkeyCsvExport,
  buildOkkeyJsonExport,
  buildOkkeyZipExport,
} from "./okkey-exporter.js";
import {
  buildBitwardenCsvExport,
  buildBitwardenJsonExport,
  buildBitwardenZipExport,
} from "./bitwarden-exporter.js";
import { buildLoginCsvExport, type LoginCsvPreset } from "./login-csv-exporter.js";
import { buildOnePassword1PuxExport } from "./onepassword-1pux-exporter.js";
import { collectLoginLike } from "./export-field-utils.js";

export type ExportFormatOption = {
  id: string;
  name: string;
  featured: boolean;
  fileExtension: string;
  mimeType: string;
  supportsExportPassword: boolean;
  supportsFolders: boolean;
  supportsAttachments: boolean;
};

const exportFormatOptions: ExportFormatOption[] = [
  {
    id: "okkeyjson",
    name: "Okkey (json)",
    featured: true,
    fileExtension: "json",
    mimeType: "application/json",
    supportsExportPassword: true,
    supportsFolders: true,
    supportsAttachments: false,
  },
  {
    id: "okkeycsv",
    name: "Okkey (csv)",
    featured: true,
    fileExtension: "csv",
    mimeType: "text/csv",
    supportsExportPassword: false,
    supportsFolders: true,
    supportsAttachments: false,
  },
  {
    id: "okkeyzip",
    name: "Okkey ZIP (с файлами)",
    featured: true,
    fileExtension: "zip",
    mimeType: "application/zip",
    supportsExportPassword: true,
    supportsFolders: true,
    supportsAttachments: true,
  },
  {
    id: "onepasswordcsv",
    name: "1Password (csv)",
    featured: true,
    fileExtension: "csv",
    mimeType: "text/csv",
    supportsExportPassword: false,
    supportsFolders: false,
    supportsAttachments: false,
  },
  {
    id: "onepassword1pux",
    name: "1Password (1pux)",
    featured: true,
    fileExtension: "1pux",
    mimeType: "application/zip",
    supportsExportPassword: false,
    supportsFolders: true,
    supportsAttachments: false,
  },
  {
    id: "bitwardenjson",
    name: "Bitwarden (json)",
    featured: true,
    fileExtension: "json",
    mimeType: "application/json",
    supportsExportPassword: true,
    supportsFolders: true,
    supportsAttachments: false,
  },
  {
    id: "bitwardencsv",
    name: "Bitwarden (csv)",
    featured: true,
    fileExtension: "csv",
    mimeType: "text/csv",
    supportsExportPassword: false,
    supportsFolders: true,
    supportsAttachments: false,
  },
  {
    id: "bitwardenzip",
    name: "Bitwarden ZIP (с файлами)",
    featured: true,
    fileExtension: "zip",
    mimeType: "application/zip",
    supportsExportPassword: true,
    supportsFolders: true,
    supportsAttachments: true,
  },
  {
    id: "chromecsv",
    name: "Chrome (csv)",
    featured: true,
    fileExtension: "csv",
    mimeType: "text/csv",
    supportsExportPassword: false,
    supportsFolders: false,
    supportsAttachments: false,
  },
  {
    id: "edgecsv",
    name: "Microsoft Edge (csv)",
    featured: false,
    fileExtension: "csv",
    mimeType: "text/csv",
    supportsExportPassword: false,
    supportsFolders: false,
    supportsAttachments: false,
  },
  {
    id: "firefoxcsv",
    name: "Firefox (csv)",
    featured: false,
    fileExtension: "csv",
    mimeType: "text/csv",
    supportsExportPassword: false,
    supportsFolders: false,
    supportsAttachments: false,
  },
  {
    id: "safaricsv",
    name: "Safari (csv)",
    featured: false,
    fileExtension: "csv",
    mimeType: "text/csv",
    supportsExportPassword: false,
    supportsFolders: false,
    supportsAttachments: false,
  },
  {
    id: "lastpasscsv",
    name: "LastPass (csv)",
    featured: true,
    fileExtension: "csv",
    mimeType: "text/csv",
    supportsExportPassword: false,
    supportsFolders: true,
    supportsAttachments: false,
  },
  {
    id: "nordpasscsv",
    name: "NordPass (csv)",
    featured: false,
    fileExtension: "csv",
    mimeType: "text/csv",
    supportsExportPassword: false,
    supportsFolders: true,
    supportsAttachments: false,
  },
  {
    id: "roboformcsv",
    name: "RoboForm (csv)",
    featured: false,
    fileExtension: "csv",
    mimeType: "text/csv",
    supportsExportPassword: false,
    supportsFolders: true,
    supportsAttachments: false,
  },
  {
    id: "keepass2xml",
    name: "KeePass 2 (xml)",
    featured: false,
    fileExtension: "xml",
    mimeType: "application/xml",
    supportsExportPassword: false,
    supportsFolders: true,
    supportsAttachments: false,
  },
  {
    id: "kasperskytxt",
    name: "Kaspersky Password Manager (txt)",
    featured: true,
    fileExtension: "txt",
    mimeType: "text/plain",
    supportsExportPassword: false,
    supportsFolders: false,
    supportsAttachments: false,
  },
  {
    id: "kasperskycsv",
    name: "Kaspersky / My Kaspersky (csv)",
    featured: true,
    fileExtension: "csv",
    mimeType: "text/csv",
    supportsExportPassword: false,
    supportsFolders: false,
    supportsAttachments: false,
  },
  {
    id: "yandexcsv",
    name: "Yandex Browser (csv)",
    featured: true,
    fileExtension: "csv",
    mimeType: "text/csv",
    supportsExportPassword: false,
    supportsFolders: false,
    supportsAttachments: false,
  },
  {
    id: "passworkjson",
    name: "Passwork (json)",
    featured: true,
    fileExtension: "json",
    mimeType: "application/json",
    supportsExportPassword: false,
    supportsFolders: true,
    supportsAttachments: false,
  },
  {
    id: "genericcsv",
    name: "Custom CSV",
    featured: false,
    fileExtension: "csv",
    mimeType: "text/csv",
    supportsExportPassword: false,
    supportsFolders: true,
    supportsAttachments: false,
  },
];

export function listExportFormatOptions(): ExportFormatOption[] {
  return exportFormatOptions.map((option) => ({ ...option }));
}

export function getExportFormatOption(id: string): ExportFormatOption | undefined {
  return listExportFormatOptions().find((option) => option.id === id);
}

export type RunExportParams = {
  formatId: string;
  items: ExportSourceItem[];
  includeFolders?: boolean;
  password?: string;
};

export type RunExportResult = {
  bytes: Uint8Array;
  fileName: string;
  mimeType: string;
};

export async function runExport(params: RunExportParams): Promise<RunExportResult> {
  const option = getExportFormatOption(params.formatId);
  if (!option) {
    throw new Error(`Unknown export format: ${params.formatId}`);
  }

  const includeFolders = params.includeFolders !== false && option.supportsFolders;
  const password = option.supportsExportPassword ? params.password : undefined;
  let bytes: Uint8Array;

  switch (params.formatId) {
    case "okkeyjson":
      bytes = await buildOkkeyJsonExport({ items: params.items, includeFolders, password });
      break;
    case "okkeycsv":
      bytes = await buildOkkeyCsvExport({ items: params.items, includeFolders });
      break;
    case "okkeyzip":
      bytes = await buildOkkeyZipExport({ items: params.items, includeFolders, password });
      break;
    case "bitwardenjson":
      bytes = await buildBitwardenJsonExport({ items: params.items, includeFolders, password });
      break;
    case "bitwardencsv":
      bytes = await buildBitwardenCsvExport({ items: params.items, includeFolders });
      break;
    case "bitwardenzip":
      bytes = await buildBitwardenZipExport({ items: params.items, includeFolders, password });
      break;
    case "onepassword1pux":
      bytes = buildOnePassword1PuxExport(params.items);
      break;
    case "keepass2xml":
      bytes = new TextEncoder().encode(buildKeePassXml(params.items, includeFolders));
      break;
    case "kasperskytxt":
      bytes = new TextEncoder().encode(buildKasperskyTxt(params.items));
      break;
    case "passworkjson":
      bytes = new TextEncoder().encode(buildPassworkJson(params.items, includeFolders));
      break;
    default: {
      const preset = csvPresetForFormat(params.formatId);
      bytes = buildLoginCsvExport(params.items, preset);
      break;
    }
  }

  const stamp = new Date().toISOString().slice(0, 10);
  return {
    bytes,
    fileName: `okkey-export-${stamp}.${option.fileExtension}`,
    mimeType: option.mimeType,
  };
}

function csvPresetForFormat(formatId: string): LoginCsvPreset {
  switch (formatId) {
    case "chromecsv":
    case "edgecsv":
      return "chrome";
    case "firefoxcsv":
      return "firefox";
    case "safaricsv":
      return "safari";
    case "lastpasscsv":
      return "lastpass";
    case "nordpasscsv":
      return "nordpass";
    case "roboformcsv":
      return "roboform";
    case "kasperskycsv":
      return "kaspersky";
    case "yandexcsv":
      return "yandex";
    case "onepasswordcsv":
      return "onepassword";
    default:
      return "generic";
  }
}

function buildKeePassXml(items: ExportSourceItem[], includeFolders: boolean): string {
  const entries = items
    .filter((source) => !source.item.deleted)
    .map((source) => {
      const login = collectLoginLike(source.item);
      const group = includeFolders && source.folderPath ? escapeXml(source.folderPath) : "Root";
      return `<Group><Name>${group}</Name><Entry><String><Key>Title</Key><Value>${escapeXml(source.item.title)}</Value></String><String><Key>UserName</Key><Value>${escapeXml(login.username)}</Value></String><String><Key>Password</Key><Value ProtectInMemory="True">${escapeXml(login.password)}</Value></String><String><Key>URL</Key><Value>${escapeXml(login.url)}</Value></String><String><Key>Notes</Key><Value>${escapeXml(login.notes)}</Value></String></Entry></Group>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="utf-8" standalone="yes"?><KeePassFile><Root><Group><Name>Okkey</Name>${entries}</Group></Root></KeePassFile>\n`;
}

function buildKasperskyTxt(items: ExportSourceItem[]): string {
  const blocks = items
    .filter((source) => !source.item.deleted)
    .map((source) => {
      const login = collectLoginLike(source.item);
      return [
        "Websites",
        `Website name: ${source.item.title}`,
        `Website URL: ${login.url}`,
        `Login: ${login.username}`,
        `Password: ${login.password}`,
        `Comment: ${login.notes}`,
        "---",
      ].join("\n");
    });
  return `${blocks.join("\n")}\n`;
}

function buildPassworkJson(items: ExportSourceItem[], includeFolders: boolean): string {
  const passwords = items
    .filter((source) => !source.item.deleted)
    .map((source) => {
      const login = collectLoginLike(source.item);
      return {
        name: source.item.title,
        login: login.username,
        password: login.password,
        url: login.url,
        description: login.notes,
        folder: includeFolders ? source.folderPath ?? "" : "",
        tags: source.item.tags ?? [],
      };
    });
  return `${JSON.stringify({ passwords }, null, 2)}\n`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
