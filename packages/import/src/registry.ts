import type { Importer } from "./importers/importer.js";
import { BitwardenCsvImporter } from "./importers/bitwarden-csv-importer.js";
import { BitwardenJsonImporter } from "./importers/bitwarden-json-importer.js";
import { ChromeCsvImporter } from "./importers/chrome-csv-importer.js";
import { FirefoxCsvImporter } from "./importers/firefox-csv-importer.js";
import { GenericCsvImporter } from "./importers/generic-csv-importer.js";
import { KasperskyCsvImporter } from "./importers/kaspersky-csv-importer.js";
import { KasperskyTxtImporter } from "./importers/kaspersky-txt-importer.js";
import { KeePass2XmlImporter } from "./importers/keepass2-xml-importer.js";
import { LastPassCsvImporter } from "./importers/lastpass-csv-importer.js";
import { NordPassCsvImporter } from "./importers/nordpass-csv-importer.js";
import { PassworkJsonImporter } from "./importers/passwork-json-importer.js";
import { RoboFormCsvImporter } from "./importers/roboform-csv-importer.js";
import { SafariCsvImporter } from "./importers/safari-csv-importer.js";
import { YandexCsvImporter } from "./importers/yandex-csv-importer.js";

export type ImportFormatOption = {
  id: string;
  name: string;
  featured: boolean;
  acceptedFileTypes: readonly string[];
  supportsTextPaste: boolean;
  requiresExportPassword?: boolean;
};

type ImporterFactory = () => Importer;

const importerFactories: Record<string, ImporterFactory> = {
  bitwardenjson: () => new BitwardenJsonImporter(),
  bitwardencsv: () => new BitwardenCsvImporter(),
  bitwardenzip: () => new BitwardenJsonImporter(),
  chromecsv: () => new ChromeCsvImporter(),
  edgecsv: () => new ChromeCsvImporter(),
  operacsv: () => new ChromeCsvImporter(),
  bravecsv: () => new ChromeCsvImporter(),
  vivaldicsv: () => new ChromeCsvImporter(),
  arccsv: () => new ChromeCsvImporter(),
  firefoxcsv: () => new FirefoxCsvImporter(),
  safaricsv: () => new SafariCsvImporter(),
  lastpasscsv: () => new LastPassCsvImporter(),
  nordpasscsv: () => new NordPassCsvImporter(),
  kasperskytxt: () => new KasperskyTxtImporter(),
  kasperskycsv: () => new KasperskyCsvImporter(),
  keepass2xml: () => new KeePass2XmlImporter(),
  roboformcsv: () => new RoboFormCsvImporter(),
  passworkjson: () => new PassworkJsonImporter(),
  yandexcsv: () => new YandexCsvImporter(),
  yandexzip: () => new YandexCsvImporter(),
  genericcsv: () => new GenericCsvImporter(),
};

const featuredFormatIds = new Set([
  "bitwardenjson",
  "bitwardencsv",
  "bitwardenzip",
  "chromecsv",
  "lastpasscsv",
  "kasperskytxt",
  "kasperskycsv",
  "yandexcsv",
  "passworkjson",
]);

export const importFormatOptions: ImportFormatOption[] = [
  { id: "bitwardenjson", name: "Bitwarden (json)", featured: true, acceptedFileTypes: ["json"], supportsTextPaste: true },
  { id: "bitwardencsv", name: "Bitwarden (csv)", featured: true, acceptedFileTypes: ["csv"], supportsTextPaste: true },
  {
    id: "bitwardenzip",
    name: "Bitwarden ZIP (с файлами)",
    featured: true,
    acceptedFileTypes: ["zip"],
    supportsTextPaste: false,
  },
  { id: "chromecsv", name: "Chrome (csv)", featured: true, acceptedFileTypes: ["csv"], supportsTextPaste: true },
  { id: "edgecsv", name: "Microsoft Edge (csv)", featured: false, acceptedFileTypes: ["csv"], supportsTextPaste: true },
  { id: "firefoxcsv", name: "Firefox (csv)", featured: false, acceptedFileTypes: ["csv"], supportsTextPaste: true },
  { id: "safaricsv", name: "Safari (csv)", featured: false, acceptedFileTypes: ["csv"], supportsTextPaste: true },
  { id: "lastpasscsv", name: "LastPass (csv)", featured: true, acceptedFileTypes: ["csv"], supportsTextPaste: true },
  { id: "nordpasscsv", name: "NordPass (csv)", featured: false, acceptedFileTypes: ["csv"], supportsTextPaste: true },
  { id: "roboformcsv", name: "RoboForm (csv)", featured: false, acceptedFileTypes: ["csv"], supportsTextPaste: true },
  { id: "keepass2xml", name: "KeePass 2 (xml)", featured: false, acceptedFileTypes: ["xml"], supportsTextPaste: true },
  { id: "kasperskytxt", name: "Kaspersky Password Manager (txt)", featured: true, acceptedFileTypes: ["txt"], supportsTextPaste: true },
  { id: "kasperskycsv", name: "Kaspersky / My Kaspersky (csv)", featured: true, acceptedFileTypes: ["csv"], supportsTextPaste: true },
  { id: "yandexcsv", name: "Yandex Browser (csv)", featured: true, acceptedFileTypes: ["csv"], supportsTextPaste: true },
  {
    id: "yandexzip",
    name: "Yandex Browser (zip)",
    featured: false,
    acceptedFileTypes: ["zip"],
    supportsTextPaste: false,
    requiresExportPassword: true,
  },
  { id: "passworkjson", name: "Passwork (json)", featured: true, acceptedFileTypes: ["json"], supportsTextPaste: true },
  { id: "genericcsv", name: "Custom CSV", featured: false, acceptedFileTypes: ["csv"], supportsTextPaste: true },
];

export function listImportFormatOptions(): ImportFormatOption[] {
  return importFormatOptions.map((option) => ({
    ...option,
    featured: featuredFormatIds.has(option.id) || option.featured,
  }));
}

export function getImportFormatOption(id: string): ImportFormatOption | undefined {
  return listImportFormatOptions().find((option) => option.id === id);
}

export function createImporter(
  formatId: string,
  options?: { password?: string },
): Importer {
  if (formatId === "bitwardenjson" || formatId === "bitwardenzip") {
    return new BitwardenJsonImporter({ password: options?.password });
  }
  const factory = importerFactories[formatId] ?? importerFactories.genericcsv;
  return factory();
}

export async function runImport(formatId: string, text: string, options?: { password?: string }) {
  const importer = createImporter(formatId, options);
  return importer.parse(text);
}
