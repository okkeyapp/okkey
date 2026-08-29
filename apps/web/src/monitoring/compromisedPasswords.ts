const HIBP_RANGE_URL = "https://api.pwnedpasswords.com/range";
const HIBP_FETCH_TIMEOUT_MS = 8_000;

async function sha1HexUpper(password: string): Promise<string> {
  const data = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest("SHA-1", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

const rangeCache = new Map<string, Set<string>>();

async function fetchPwnedSuffixes(prefix: string): Promise<Set<string>> {
  const cached = rangeCache.get(prefix);
  if (cached) {
    return cached;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HIBP_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(`${HIBP_RANGE_URL}/${prefix}`, {
      signal: controller.signal,
      headers: { "Add-Padding": "true" },
    });
    if (!response.ok) {
      throw new Error(`HIBP range failed: ${response.status}`);
    }
    const text = await response.text();
    const suffixes = new Set<string>();
    for (const line of text.split("\n")) {
      const suffix = line.trim().split(":")[0]?.toUpperCase();
      if (suffix) {
        suffixes.add(suffix);
      }
    }
    rangeCache.set(prefix, suffixes);
    return suffixes;
  } finally {
    clearTimeout(timer);
  }
}

export async function isPasswordCompromised(password: string): Promise<boolean> {
  const hash = await sha1HexUpper(password);
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);
  const suffixes = await fetchPwnedSuffixes(prefix);
  return suffixes.has(suffix);
}

export type CompromisedPasswordCheckInput = {
  itemId: string;
  password: string;
};

/**
 * Returns item ids whose password appears in HIBP (k-anonymity range API).
 * Failures for individual passwords are skipped (treated as not compromised).
 */
export async function findCompromisedItemIds(
  entries: readonly CompromisedPasswordCheckInput[],
): Promise<string[]> {
  const byPassword = new Map<string, string[]>();
  for (const entry of entries) {
    const group = byPassword.get(entry.password);
    if (group) {
      group.push(entry.itemId);
    } else {
      byPassword.set(entry.password, [entry.itemId]);
    }
  }

  const compromised = new Set<string>();
  const uniquePasswords = [...byPassword.keys()];
  const concurrency = 4;
  for (let i = 0; i < uniquePasswords.length; i += concurrency) {
    const chunk = uniquePasswords.slice(i, i + concurrency);
    await Promise.all(
      chunk.map(async (password) => {
        try {
          if (await isPasswordCompromised(password)) {
            for (const itemId of byPassword.get(password) ?? []) {
              compromised.add(itemId);
            }
          }
        } catch {
          // Network / API errors: skip password (do not mark compromised).
        }
      }),
    );
  }
  return [...compromised];
}
