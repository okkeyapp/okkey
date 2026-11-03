import net from "node:net";

import pg from "pg";

import { E2E_DATABASE_URL } from "./env";

const E2E_REDIS_URL = process.env.E2E_REDIS_URL ?? process.env.REDIS_URL ?? "redis://127.0.0.1:6379";

function redisCommand(urlString: string, args: string[]): Promise<void> {
  const url = new URL(urlString);
  const payload =
    `*${args.length}\r\n` +
    args.map((arg) => `$${Buffer.byteLength(arg)}\r\n${arg}\r\n`).join("");
  return new Promise((resolve, reject) => {
    const socket = net.connect({
      host: url.hostname,
      port: Number(url.port || 6379),
    });
    let buf = "";
    const finish = (error?: Error) => {
      socket.destroy();
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };
    socket.setTimeout(3_000, () => finish(new Error("redis command timed out")));
    socket.on("error", (error) => finish(error));
    socket.on("data", (chunk) => {
      buf += chunk.toString("utf8");
      if (!buf.includes("\r\n")) {
        return;
      }
      if (buf.startsWith("-")) {
        finish(new Error(buf.trim()));
        return;
      }
      finish();
    });
    socket.on("connect", () => {
      socket.write(payload);
    });
  });
}

/**
 * Each browser spec starts and ends on an empty account catalog.
 * Bootstrap registration is only offered when no user exists, and the first-run
 * claim lives in Redis, so both stores are cleared. Specs do not share users.
 */
export async function resetE2eCatalog(): Promise<void> {
  const client = new pg.Client({ connectionString: E2E_DATABASE_URL });
  client.on("error", () => {});
  await client.connect();
  try {
    await client.query("TRUNCATE TABLE users RESTART IDENTITY CASCADE");
  } finally {
    await client.end();
  }
  await redisCommand(E2E_REDIS_URL, ["FLUSHDB"]);
}

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
