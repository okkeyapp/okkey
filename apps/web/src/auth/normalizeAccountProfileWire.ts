/**
 * Normalize `GET /account/profile` JSON: tolerate camelCase (accidental proxies / older builds)
 * and missing types so client merge never throws on `.trim()`.
 */
export type NormalizedAccountProfileWire = {
  email: string;
  first_name: string | null;
  last_name: string | null;
  vault_idle_lock_seconds: number;
};

function pickTrimmedString(o: Record<string, unknown>, snake: string, camel: string): string | null {
  const v = o[snake] ?? o[camel];
  if (typeof v !== "string") {
    return null;
  }
  const t = v.trim();
  return t.length > 0 ? t : null;
}

export function normalizeAccountProfileWire(raw: unknown): NormalizedAccountProfileWire | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const o = raw as Record<string, unknown>;
  const emailRaw = o.email;
  const email = typeof emailRaw === "string" ? emailRaw.trim() : "";

  const first_name = pickTrimmedString(o, "first_name", "firstName");
  const last_name = pickTrimmedString(o, "last_name", "lastName");

  const idleRaw = o.vault_idle_lock_seconds ?? o.vaultIdleLockSeconds;
  let vault_idle_lock_seconds = 900;
  if (typeof idleRaw === "number" && Number.isFinite(idleRaw)) {
    vault_idle_lock_seconds = idleRaw;
  } else if (typeof idleRaw === "string" && idleRaw.trim()) {
    const n = Number(idleRaw);
    if (Number.isFinite(n)) {
      vault_idle_lock_seconds = n;
    }
  }

  return {
    email,
    first_name,
    last_name,
    vault_idle_lock_seconds,
  };
}
