import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";
import path from "node:path";
import maxmind from "maxmind";

const databasePath = process.env.GEOIP_DB_PATH ?? "/geoip/city.mmdb";
const intervalMs = Number(process.env.GEOIP_UPDATE_INTERVAL_MS ?? 24 * 60 * 60 * 1000);

async function update() {
  const now = new Date();
  const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const url =
    process.env.GEOIP_DOWNLOAD_URL ??
    `https://download.db-ip.com/free/dbip-city-lite-${month}.mmdb.gz`;
  const directory = path.dirname(databasePath);
  const temporaryGzip = `${databasePath}.${process.pid}.gz`;
  const temporaryDatabase = `${databasePath}.${process.pid}.tmp`;
  await mkdir(directory, { recursive: true });

  try {
    const response = await fetch(url, { redirect: "follow" });
    if (!response.ok || !response.body) {
      throw new Error(`download failed with HTTP ${response.status}`);
    }
    await pipeline(response.body, createWriteStream(temporaryGzip));
    await pipeline(
      createReadStream(temporaryGzip),
      createGunzip(),
      createWriteStream(temporaryDatabase),
    );
    const reader = await maxmind.open(temporaryDatabase);
    reader.get("8.8.8.8");
    await rename(temporaryDatabase, databasePath);
    await writeFile(
      `${databasePath}.metadata.json`,
      JSON.stringify({ provider: "DB-IP City Lite", license: "CC BY 4.0", source: url, updatedAt: now.toISOString() }),
      "utf8",
    );
    console.info(`GeoIP database updated from ${url}`);
  } finally {
    await Promise.all([rm(temporaryGzip, { force: true }), rm(temporaryDatabase, { force: true })]);
  }
}

async function run() {
  try {
    await update();
  } catch (error) {
    console.error("GeoIP update failed; keeping previous database", error);
  }
  setTimeout(run, intervalMs);
}

await run();
await new Promise(() => {});
