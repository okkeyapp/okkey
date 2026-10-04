export const AUTOFILL_MSG = {
  query: "okkey.autofill.query",
  fill: "okkey.autofill.fill",
  unlock: "okkey.autofill.unlock",
  unlocked: "okkey.autofill.unlocked",
} as const;

export type AutofillSuggestion = {
  itemId: string;
  title: string;
  username: string;
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

export type AutofillRuntimeMessage =
  | AutofillQueryMessage
  | AutofillFillMessage
  | AutofillUnlockMessage
  | AutofillUnlockedMessage;
