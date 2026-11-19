import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import type { CorpusSite, InterfaceLang } from "./types.ts";
import { SITES_CSV } from "./paths.ts";

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

/** Stable page id from domain (+ short url hash when multiple URLs share a domain). */
export function pageIdForSite(site: Pick<CorpusSite, "domain" | "url">): string {
  const host = site.domain.trim().toLowerCase();
  const hash = createHash("sha1").update(site.url).digest("hex").slice(0, 8);
  return `${host}__${hash}`;
}

export function loadCorpusSites(csvPath: string = SITES_CSV): CorpusSite[] {
  const raw = readFileSync(csvPath, "utf8");
  const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) {
    return [];
  }
  const header = parseCsvLine(lines[0]!);
  const idx = Object.fromEntries(header.map((name, i) => [name, i])) as Record<string, number>;
  const required = ["domain", "url", "lang", "category", "form_types", "http_status"];
  for (const key of required) {
    if (idx[key] === undefined) {
      throw new Error(`sites.csv missing column: ${key}`);
    }
  }

  const sites: CorpusSite[] = [];
  for (const line of lines.slice(1)) {
    const cols = parseCsvLine(line);
    const lang = (cols[idx.lang!] ?? "").trim().toUpperCase();
    if (lang !== "RU" && lang !== "EN") {
      throw new Error(`Invalid lang in sites.csv: ${lang}`);
    }
    sites.push({
      domain: (cols[idx.domain!] ?? "").trim(),
      url: (cols[idx.url!] ?? "").trim(),
      lang: lang as InterfaceLang,
      category: (cols[idx.category!] ?? "").trim(),
      formTypes: (cols[idx.form_types!] ?? "")
        .split(";")
        .map((part) => part.trim())
        .filter(Boolean),
      notes: (cols[idx.notes!] ?? "").trim(),
      httpStatus: (cols[idx.http_status!] ?? "").trim(),
    });
  }
  return sites;
}

export function corpusIdFromSites(sites: CorpusSite[]): string {
  const fingerprint = sites
    .map((site) => `${site.domain}|${site.url}|${site.lang}`)
    .sort()
    .join("\n");
  return createHash("sha256").update(fingerprint).digest("hex").slice(0, 16);
}
