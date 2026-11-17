import type { RegistryPullCredentials } from "../system-updates/package-format.ts";

/** Docker `X-Registry-Auth` value. Callers must not write or log the result. */
export function encodeRegistryAuth(credentials: RegistryPullCredentials): string {
  return Buffer.from(
    JSON.stringify({
      username: credentials.username,
      password: credentials.password,
      serveraddress: credentials.server,
    }),
  ).toString("base64");
}

/** Registry host of an image reference. Official library images use `docker.io`. */
export function imageRegistryHost(image: string): string {
  const slash = image.indexOf("/");
  const first = (slash < 0 ? image : image.slice(0, slash)).toLowerCase();
  if (slash < 0 || !(first === "localhost" || first.includes(".") || first.includes(":"))) {
    return "docker.io";
  }
  const at = first.indexOf("@");
  return at > 0 ? first.slice(0, at) : first;
}

export function credentialSecrets(credentials: RegistryPullCredentials | undefined): string[] {
  if (!credentials) {
    return [];
  }
  return [
    credentials.password,
    encodeRegistryAuth(credentials),
    Buffer.from(credentials.password).toString("base64"),
  ];
}

export function scrubSecrets(message: string, secrets: readonly string[]): string {
  let next = message;
  for (const secret of secrets) {
    if (secret.length < 6 || !next.includes(secret)) {
      continue;
    }
    next = next.split(secret).join("[redacted]");
  }
  return next;
}
