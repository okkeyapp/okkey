import { describe, expect, it } from "vitest";

import { formatImportFailureMessage } from "./importFailureMessage";

const t = (key: string) =>
  ({
    "web.tools.import.errors.generic": "import failed",
    "web.tools.import.errors.incomplete": "import paused",
    "web.tools.import.errors.conflict": "import conflict",
  })[key] ?? key;

describe("formatImportFailureMessage", () => {
  it("hides raw outbox codes", () => {
    expect(formatImportFailureMessage("OUTBOX_ENTRY_NOT_APPENDED:UNKNOWN", t)).toBe(
      "import paused",
    );
    expect(formatImportFailureMessage("OUTBOX_ENTRY_NOT_APPENDED:INTERNAL_SERVER_ERROR", t)).toBe(
      "import paused",
    );
  });

  it("maps a 409 conflict code to the conflict sentence", () => {
    expect(formatImportFailureMessage("OUTBOX_ENTRY_NOT_APPENDED:VERSION_MISMATCH", t)).toBe(
      "import conflict",
    );
    expect(formatImportFailureMessage("SYNC_ITEM_ALREADY_EXISTS", t)).toBe("import conflict");
  });

  it("keeps human messages", () => {
    expect(formatImportFailureMessage("Attachment skipped", t)).toBe("Attachment skipped");
  });
});
