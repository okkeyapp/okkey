export type PublicAppUrlResolver = () => Promise<string>;

/** Effective public app origin: database when a resolver is installed, otherwise the env fallback. */
export async function resolveLinkBaseUrl(
  fallback: string | undefined,
  resolver?: PublicAppUrlResolver,
): Promise<string> {
  const raw = resolver ? await resolver() : (fallback ?? "");
  return raw.trim().replace(/\/$/, "");
}
