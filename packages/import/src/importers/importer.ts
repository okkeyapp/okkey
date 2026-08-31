import type { ImportResult } from "../types/import-result.js";

export interface Importer {
  organizationId?: string | null;
  parse(data: string): Promise<ImportResult>;
}
