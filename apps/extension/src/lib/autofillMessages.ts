export const AUTOFILL_MSG = {
  query: "okkey.autofill.query",
  fill: "okkey.autofill.fill",
  unlock: "okkey.autofill.unlock",
  unlocked: "okkey.autofill.unlocked",
  save: "okkey.autofill.save",
  openAndFill: "okkey.autofill.openAndFill",
  applyFill: "okkey.autofill.applyFill",
} as const;

export type AutofillSuggestion = {
  itemId: string;
  title: string;
  username: string;
  iconUrl?: string;
};

export type AutofillQueryResponse =
  | { status: "signed-out" }
  | { status: "locked" }
  | { status: "ok"; suggestions: AutofillSuggestion[] };

export type AutofillFillResponse =
  | { status: "signed-out" }
  | { status: "locked" }
  | { status: "not-found" }
  | { status: "ok"; fill: { username: string; password: string; totp?: string } };

export type AutofillSaveResponse =
  | { status: "signed-out" }
  | { status: "locked" }
  | { status: "exists" }
  | { status: "error"; message: string }
  | { status: "ok"; itemId: string };

export type AutofillOpenAndFillResponse =
  | { status: "signed-out" }
  | { status: "locked" }
  | { status: "error"; message: string }
  | { status: "ok" };

export type AutofillQueryMessage = {
  type: typeof AUTOFILL_MSG.query;
  pageUrl: string;
};

export type AutofillFillMessage = {
  type: typeof AUTOFILL_MSG.fill;
  itemId: string;
  pageUrl: string;
};

export type AutofillUnlockMessage = {
  type: typeof AUTOFILL_MSG.unlock;
};

export type AutofillUnlockedMessage = {
  type: typeof AUTOFILL_MSG.unlocked;
};

export type AutofillSaveMessage = {
  type: typeof AUTOFILL_MSG.save;
  pageUrl: string;
  websiteUrl: string;
  title: string;
  username: string;
  password: string;
};

export type AutofillOpenAndFillMessage = {
  type: typeof AUTOFILL_MSG.openAndFill;
  itemId: string;
  url: string;
};

export type AutofillApplyFillMessage = {
  type: typeof AUTOFILL_MSG.applyFill;
  itemId: string;
  pageUrl: string;
};

export type AutofillRuntimeMessage =
  | AutofillQueryMessage
  | AutofillFillMessage
  | AutofillUnlockMessage
  | AutofillUnlockedMessage
  | AutofillSaveMessage
  | AutofillOpenAndFillMessage
  | AutofillApplyFillMessage;
