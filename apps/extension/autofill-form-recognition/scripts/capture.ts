#!/usr/bin/env node
/**
 * Capture corpus pages into the local gitignored cache and draft annotator A.
 * Usage:
 *   yarn --cwd apps/extension corpus:capture
 *   yarn --cwd apps/extension corpus:capture --limit 20
 *   yarn --cwd apps/extension corpus:capture --domain en.wikipedia.org
 */
import { captureCorpus } from "../src/capture.ts";

function argValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) {
    return undefined;
  }
  return process.argv[idx + 1];
}

async function main(): Promise<void> {
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
