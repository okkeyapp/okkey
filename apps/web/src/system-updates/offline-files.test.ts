import {
  OFFLINE_BUNDLE_MAX_ARCHIVE_BYTES,
  OFFLINE_BUNDLE_MAX_DOCUMENT_BYTES,
  isOfflineUploadTooLarge,
} from "@okkey/types";
import { describe, expect, it } from "vitest";

import {
  OFFLINE_PACKAGE_MAX_SIZE_BYTES,
  offlineFileExceedsSizeLimit,
} from "./offline-files";

describe("offline upload size limit", () => {
  it("shares the server document ceiling with the UI picker", () => {
    expect(OFFLINE_PACKAGE_MAX_SIZE_BYTES).toBe(OFFLINE_BUNDLE_MAX_DOCUMENT_BYTES);
    expect(OFFLINE_BUNDLE_MAX_DOCUMENT_BYTES).toBeGreaterThan(OFFLINE_BUNDLE_MAX_ARCHIVE_BYTES);
    expect(OFFLINE_BUNDLE_MAX_DOCUMENT_BYTES).toBe(
      4 * Math.ceil(OFFLINE_BUNDLE_MAX_ARCHIVE_BYTES / 3) + 2048,
    );
  });

  it("rejects files larger than the shared document limit immediately", () => {
    expect(offlineFileExceedsSizeLimit({ size: OFFLINE_BUNDLE_MAX_DOCUMENT_BYTES })).toBe(false);
    expect(offlineFileExceedsSizeLimit({ size: OFFLINE_BUNDLE_MAX_DOCUMENT_BYTES + 1 })).toBe(true);
    expect(isOfflineUploadTooLarge(OFFLINE_BUNDLE_MAX_DOCUMENT_BYTES + 1)).toBe(true);
    expect(offlineFileExceedsSizeLimit({ size: 0 })).toBe(false);
  });
});
