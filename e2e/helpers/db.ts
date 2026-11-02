import pg from "pg";

import { E2E_DATABASE_URL } from "./env";

/** Legacy wraps have no possession public key, so proof must refuse them. */
export async function clearRecoveryPossessionPublicKey(email: string): Promise<void> {
  const client = new pg.Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    const result = await client.query(
      `
        UPDATE user_vault_recovery_wrap
        SET possession_public_key = NULL
        WHERE user_id = (SELECT id FROM users WHERE lower(email) = lower($1))
      `,
      [email],
    );
    if (result.rowCount !== 1) {
      throw new Error(`expected one recovery wrap to clear, updated ${result.rowCount ?? 0}`);
    }
  } finally {
    await client.end();
  }
}

/**
 * qa/web 14.8 / 7.1: vault item + sync event blobs on the server must not contain plaintext secrets.
 */
export async function assertVaultBlobsHaveNoPlaintext(secrets: string[]): Promise<void> {
  const client = new pg.Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query<{ blob: string }>(`
      SELECT encode(encrypted_data, 'escape') AS blob FROM items
      UNION ALL
      SELECT encode(encrypted_payload, 'escape') AS blob FROM events
    `);
    for (const row of rows) {
      for (const secret of secrets) {
        if (!secret) continue;
        if (row.blob.includes(secret)) {
          throw new Error(`plaintext secret leaked into vault blob (len=${secret.length})`);
        }
      }
    }
  } finally {
    await client.end();
  }
}
