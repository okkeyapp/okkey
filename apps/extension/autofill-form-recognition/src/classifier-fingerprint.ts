import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { CLASSIFIER_SOURCE_FILES } from "./paths.ts";

export type ClassifierFingerprint = {
  sha256: string;
  files: Array<{ path: string; sha256: string }>;
};

export function computeClassifierFingerprint(
  files: readonly string[] = CLASSIFIER_SOURCE_FILES,
): ClassifierFingerprint {
  const fileDigests: Array<{ path: string; sha256: string }> = [];
  const hash = createHash("sha256");
  for (const filePath of [...files].sort()) {
    const content = readFileSync(filePath);
    const fileSha = createHash("sha256").update(content).digest("hex");
    fileDigests.push({ path: filePath, sha256: fileSha });
    hash.update(filePath);
    hash.update("\0");
    hash.update(content);
    hash.update("\0");
  }
  return {
    sha256: hash.digest("hex"),
    files: fileDigests,
  };
}
