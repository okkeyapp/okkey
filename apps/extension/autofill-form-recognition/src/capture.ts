/**
 * Playwright capture → local gitignored cache (HTML + meta).
 * Never commit cache contents. No real account logins.
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  ensureAnnotatorBStub,
  writeAnnotation,
} from "./annotations.ts";
import { CACHE_DIR, CAPTURE_STATUS_FILE, pageCacheDir } from "./paths.ts";
import { loadCorpusSites, pageIdForSite } from "./sites.ts";
import {
  buildAnnotatorAFromSnapshots,
  inferPageKind,
  type SnapshotInput,
} from "./semanticAnnotate.ts";
import type { CaptureStatusEntry, CorpusSite, InterfaceLang } from "./types.ts";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const BLOCK_STATUSES = new Set([400, 401, 403, 418, 429, 439, 498, 503]);

export type CaptureOptions = {
  limit?: number;
  domains?: string[];
  timeoutMs?: number;
  /** When true, skip domains whose notes/http_status already mark bot-block. */
  skipKnownBlocked?: boolean;
};

function isKnownBlocked(site: CorpusSite): boolean {
  if (site.notes.includes("bot-block") || site.notes.includes("timeout")) {
    return true;
  }
  const status = site.httpStatus;
  if (status === "timeout" || status === "000") {
    return true;
  }
  const code = Number(status);
  return Number.isFinite(code) && BLOCK_STATUSES.has(code);
}

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    try {
      return await import("@playwright/test");
    } catch (error) {
      throw new Error(
        `Playwright is required for capture. Install via the e2e workspace (yarn --cwd e2e install && yarn --cwd e2e install:browsers). ${error}`,
      );
    }
  }
}

type InPageSnapshot = {
  selector: string;
  formSelector: string | null;
  hints: {
    type: string;
    name?: string;
    id?: string;
    autocomplete?: string;
    placeholder?: string;
    ariaLabel?: string;
    labelText?: string;
    inputMode?: string;
    maxLength?: number;
    role?: string;
  };
  visible: boolean;
};

export async function captureSite(
  site: CorpusSite,
  options?: { timeoutMs?: number },
): Promise<CaptureStatusEntry> {
  const pageId = pageIdForSite(site);
  const timeoutMs = options?.timeoutMs ?? 20_000;
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: USER_AGENT,
    locale: site.lang === "RU" ? "ru-RU" : "en-US",
    viewport: { width: 1280, height: 720 },
  });
  const page = await context.newPage();
  let entry: CaptureStatusEntry = {
    pageId,
    domain: site.domain,
    url: site.url,
    lang: site.lang,
    status: "error",
  };

  try {
    const response = await page.goto(site.url, {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs,
    });
    const httpStatus = response?.status();
    entry.httpStatus = httpStatus;
    if (httpStatus && BLOCK_STATUSES.has(httpStatus)) {
      entry.status = "blocked";
      entry.detail = `HTTP ${httpStatus}`;
      writeBlockedAnnotation(pageId, site, entry.detail);
      return entry;
    }

    // Allow light SPA settle; do not log in or submit.
    await page.waitForTimeout(1500);

    const title = await page.title();
    const bodyText = (await page.locator("body").innerText().catch(() => "")).slice(0, 500);
    if (
      /captcha|access denied|attention required|cf-browser-verification|bot detection|проверить.*робот/i.test(
        `${title}\n${bodyText}`,
      )
    ) {
      entry.status = "blocked";
      entry.detail = "anti-bot interstitial";
      writeBlockedAnnotation(pageId, site, entry.detail);
      return entry;
    }

    const html = await page.content();
    const snapshots = (await page.evaluate(() => {
      const cssEscape = (value: string) => {
        if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
          return CSS.escape(value);
        }
        return value.replace(/[^a-zA-Z0-9_-]/g, (ch) => `\\${ch}`);
      };
      const selectorFor = (el: HTMLInputElement): string => {
        if (el.id) {
          return `#${cssEscape(el.id)}`;
        }
        const name = el.getAttribute("name");
        const type = (el.type || "text").toLowerCase();
        if (name) {
          return `input[type="${type}"][name="${name.replace(/"/g, '\\"')}"]`;
        }
        const all = Array.from(document.querySelectorAll("input"));
        return `input:nth-of-type(${all.indexOf(el) + 1})`;
      };
      const isVisible = (el: HTMLInputElement): boolean => {
        if (el.disabled || el.type === "hidden") {
          return false;
        }
        const style = window.getComputedStyle(el);
        if (style.visibility === "hidden" || style.display === "none") {
          return false;
        }
        return el.getClientRects().length > 0;
      };
      const labelText = (el: HTMLInputElement): string => {
        const parts: string[] = [];
        if (el.labels) {
          for (const label of Array.from(el.labels)) {
            parts.push(label.textContent ?? "");
          }
        }
        const labelledBy = el.getAttribute("aria-labelledby");
        if (labelledBy) {
          for (const id of labelledBy.split(/\s+/)) {
            parts.push(document.getElementById(id)?.textContent ?? "");
          }
        }
        return parts.join(" ").trim();
      };

      const walk = (root: ParentNode, out: InPageSnapshot[]) => {
        const inputs = Array.from(
          (root as Document | ShadowRoot).querySelectorAll?.("input") ?? [],
        );
        for (const node of inputs) {
          if (!(node instanceof HTMLInputElement)) {
            continue;
          }
          const form = node.form;
          out.push({
            selector: selectorFor(node),
            formSelector: form ? (form.id ? `form#${cssEscape(form.id)}` : "form") : null,
            visible: isVisible(node),
            hints: {
              type: node.type,
              name: node.name || undefined,
              id: node.id || undefined,
              autocomplete: node.getAttribute("autocomplete") || undefined,
              placeholder: node.placeholder || undefined,
              ariaLabel: node.getAttribute("aria-label") || undefined,
              labelText: labelText(node) || undefined,
              inputMode: node.inputMode || undefined,
              maxLength: node.maxLength > 0 ? node.maxLength : undefined,
              role: node.getAttribute("role") || undefined,
            },
          });
        }
        const hosts = Array.from((root as Document | ShadowRoot).querySelectorAll?.("*") ?? []);
        for (const host of hosts) {
          if (host instanceof Element && host.shadowRoot) {
            walk(host.shadowRoot, out);
          }
        }
      };
      const out: InPageSnapshot[] = [];
      walk(document, out);
      return out;
    })) as InPageSnapshot[];

    const dir = pageCacheDir(pageId);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "page.html"), html, "utf8");
    writeFileSync(
      path.join(dir, "meta.json"),
      `${JSON.stringify(
        {
          pageId,
          url: site.url,
          finalUrl: page.url(),
          lang: site.lang,
          httpStatus,
          capturedAt: new Date().toISOString(),
          title,
          inputCount: snapshots.length,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    writeFileSync(path.join(dir, "snapshots.json"), `${JSON.stringify(snapshots, null, 2)}\n`, "utf8");

    const visibleSnaps: SnapshotInput[] = snapshots
      .filter((snap) => snap.visible)
      .map((snap) => ({
        selector: snap.selector,
        formSelector: snap.formSelector,
        hints: snap.hints,
      }));

    const annotation = buildAnnotatorAFromSnapshots({
      pageId,
      url: site.url,
      lang: site.lang,
      pageKind: inferPageKind(site.formTypes, site.url),
      snapshots: visibleSnaps,
      notes: visibleSnaps.length
        ? "Annotator A drafted from HTML5/semantic rules on captured DOM (independent of classifier)."
        : "Captured but no semantic login fields found on first paint (modal/SPA likely).",
    });
    writeAnnotation(annotation);
    ensureAnnotatorBStub(pageId, site.url, site.lang as InterfaceLang);

    entry.status = "captured";
    entry.cachedAt = new Date().toISOString();
    entry.detail = `inputs=${snapshots.length} annotatedForms=${annotation.forms.length}`;
    return entry;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/Timeout/i.test(message)) {
      entry.status = "timeout";
    } else {
      entry.status = "error";
    }
    entry.detail = message.slice(0, 300);
    writeBlockedAnnotation(pageId, site, entry.detail, entry.status === "timeout" ? "blocked" : "uncapturable");
    return entry;
  } finally {
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}

function writeBlockedAnnotation(
  pageId: string,
  site: CorpusSite,
  detail: string,
  status: "blocked" | "uncapturable" = "blocked",
): void {
  writeAnnotation({
    schemaVersion: 1,
    pageId,
    url: site.url,
    lang: site.lang,
    annotator: "A",
    status,
    pageKind: inferPageKind(site.formTypes, site.url),
    forms: [],
    notes: detail,
  });
  ensureAnnotatorBStub(pageId, site.url, site.lang);
}

export type CaptureCorpusOptions = CaptureOptions & {
  /** Parallel Playwright sessions (default 4). */
  concurrency?: number;
};

export async function captureCorpus(options: CaptureCorpusOptions = {}): Promise<CaptureStatusEntry[]> {
  mkdirSync(CACHE_DIR, { recursive: true });
  const sites = loadCorpusSites();
  const selected = sites.filter((site) => {
    if (options.domains?.length) {
      return options.domains.includes(site.domain);
    }
    return true;
  });
  const limited = typeof options.limit === "number" ? selected.slice(0, options.limit) : selected;
  const results: CaptureStatusEntry[] = [];
  const concurrency = Math.max(1, options.concurrency ?? 4);

  const queue = [...limited];
  const workers = Array.from({ length: concurrency }, async () => {
    while (queue.length > 0) {
      const site = queue.shift();
      if (!site) {
        return;
      }
      if (options.skipKnownBlocked !== false && isKnownBlocked(site)) {
        const pageId = pageIdForSite(site);
        const entry: CaptureStatusEntry = {
          pageId,
          domain: site.domain,
          url: site.url,
          lang: site.lang,
          status: "skipped",
          httpStatus: site.httpStatus,
          detail: "known bot-block/timeout from corpus notes",
        };
        writeBlockedAnnotation(pageId, site, entry.detail ?? "skipped");
        results.push(entry);
        console.log(`skip ${site.domain}: ${entry.detail}`);
        continue;
      }
      console.log(`capture ${site.domain} …`);
      const entry = await captureSite(site, { timeoutMs: options.timeoutMs });
      results.push(entry);
      console.log(`  → ${site.domain}: ${entry.status}${entry.detail ? ` (${entry.detail})` : ""}`);
    }
  });
  await Promise.all(workers);

  // Stable order by domain for the committed status report.
  results.sort((a, b) => a.domain.localeCompare(b.domain));
  writeFileSync(CAPTURE_STATUS_FILE, `${JSON.stringify(results, null, 2)}\n`, "utf8");
  return results;
}

export function readCaptureStatus(): CaptureStatusEntry[] {
  if (!existsSync(CAPTURE_STATUS_FILE)) {
    return [];
  }
  return JSON.parse(readFileSync(CAPTURE_STATUS_FILE, "utf8")) as CaptureStatusEntry[];
}
