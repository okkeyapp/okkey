/**
 * Print the product SemVer and the Chrome/Edge/AMO manifest version.
 *
 *   yarn workspace @okkey/extension store-version 1.0.0-beta.2
 *
 *   product 1.0.0-beta.2
 *   store 1.0.0.2
 */
import { productSemverToStoreVersion } from "../src/lib/extensionStoreVersion.ts";

const semver = process.argv[2];
if (semver === "--help" || semver === "-h") {
  console.log("Usage: yarn workspace @okkey/extension store-version <semver>");
  console.log("Prints the product SemVer and the store manifest version.");
  process.exit(0);
}
if (!semver) {
  console.error("Usage: yarn workspace @okkey/extension store-version <semver>");
  process.exit(1);
}

try {
  const store = productSemverToStoreVersion(semver);
  console.log(`product ${semver.trim()}`);
  console.log(`store ${store}`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
}
