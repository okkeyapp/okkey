#!/usr/bin/env node
/**
 * Capture corpus pages into the local gitignored cache and draft annotator A.
 * HTML is written only under autofill-form-recognition/cache/ (never commit it).
 */
import { captureCorpus } from "../src/capture.ts";

function argValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) {
    return undefined;
  }
  return process.argv[idx + 1];
}

function printHelp(): void {
  console.log(`Usage: yarn --cwd apps/extension corpus:capture [options]

Capture corpus URLs with Playwright into gitignored cache/ and draft annotator-a.json.

Options:
  --limit <n>                 Capture only the first n sites.csv rows
  --domain <host>             Capture a single domain
  --timeout <ms>              Navigation timeout (default 20000)
  --concurrency <n>           Parallel browsers (default 4)
  --include-known-blocked     Also try rows marked bot-block/timeout in sites.csv
  --help                      Show this help

Examples:
  yarn --cwd apps/extension corpus:capture
  yarn --cwd apps/extension corpus:capture --limit 20
  yarn --cwd apps/extension corpus:capture --domain en.wikipedia.org
`);
}

async function main(): Promise<void> {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printHelp();
    return;
  }
  const limitRaw = argValue("--limit");
  const domain = argValue("--domain");
  const includeBlocked = process.argv.includes("--include-known-blocked");
  const results = await captureCorpus({
    limit: limitRaw ? Number(limitRaw) : undefined,
    domains: domain ? [domain] : undefined,
    skipKnownBlocked: !includeBlocked,
    timeoutMs: Number(argValue("--timeout") ?? 20_000),
    concurrency: Number(argValue("--concurrency") ?? 4),
  });
  const counts = results.reduce(
    (acc, row) => {
      acc[row.status] = (acc[row.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
  console.log("capture summary:", counts);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
