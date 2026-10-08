export const AUTOFILL_MSG = {
  query: "okkey.autofill.query",
  fill: "okkey.autofill.fill",
  unlock: "okkey.autofill.unlock",
  unlocked: "okkey.autofill.unlocked",
  save: "okkey.autofill.save",
  saveOffer: "okkey.autofill.saveOffer",
  saveContext: "okkey.autofill.saveContext",
  siteIcon: "okkey.autofill.siteIcon",
  openAndFill: "okkey.autofill.openAndFill",
  applyFill: "okkey.autofill.applyFill",
  /** Persist save offer across post-login redirects (per tab). */
  pendingSaveSet: "okkey.autofill.pendingSave.set",
  pendingSaveGet: "okkey.autofill.pendingSave.get",
  pendingSaveClear: "okkey.autofill.pendingSave.clear",
  pendingSaveMarkInteracted: "okkey.autofill.pendingSave.markInteracted",
} as const;

export type AutofillPendingSavePayload = {
  username: string;
  password: string;
  /** Page URL where credentials were captured (login form). */
  captureUrl: string;
  createdAt: number;
  /** User interacted on a post-redirect destination page — do not show. */
  interacted: boolean;
};

export type AutofillSuggestion = {
  itemId: string;
  title: string;
  username: string;
  /** Vault category id (`login`, `personal_data`, …). */
  categoryId?: string;
  /**
   * Login-only: stored vault favicon as a data URL.
   * Non-login categories render category color+glyph in the content script.
   */
  iconUrl?: string;
  /** Distinguishes expanded rows (e.g. multiple emails from one personal_data item). */
  suggestionKey?: string;
  /** Merge into fill values when this row is chosen (e.g. a specific email). */
  fillOverrides?: Record<string, string>;
};

export type AutofillQueryResponse =
  | { status: "signed-out" }
  | { status: "locked" }
  | { status: "ok"; suggestions: AutofillSuggestion[] };

export type AutofillFillValues = Record<string, string>;

export type AutofillFillResponse =
  | { status: "signed-out" }
  | { status: "locked" }
  | { status: "not-found" }
  | {
      status: "ok";
      fill: {
        username: string;
        password: string;
        totp?: string;
        categoryId: string;
        values: AutofillFillValues;
      };
    };

export type AutofillSaveResponse =
  | { status: "signed-out" }
  | { status: "locked" }
  | { status: "exists" }
  | { status: "error"; message: string }
  | { status: "ok"; itemId: string };

/** Decide whether to offer save, update an existing URL-match login, or stay silent. */
export type AutofillSaveOfferResponse =
  | { status: "signed-out" }
  | { status: "locked" }
  | { status: "none" }
  | { status: "save" }
  | {
      status: "update";
      itemId: string;
      title: string;
      iconUrl?: string;
    };

export type AutofillSaveVaultOption = {
  vaultId: string;
  name: string;
  icon: string;
  isPersonal: boolean;
};

export type AutofillSaveContextResponse =
  | { status: "signed-out" }
  | { status: "locked" }
  | {
      status: "ok";
      workspaceId: string;
      workspaceName: string;
      vaults: AutofillSaveVaultOption[];
      defaultVaultId: string;
    };

export type AutofillOpenAndFillResponse =
  | { status: "signed-out" }
  | { status: "locked" }
  | { status: "error"; message: string }
  | { status: "ok" };

/** Form intent from content-script heuristics (`login` | `register` | …). */
export type AutofillFormTypeMessage =
  | "login"
  | "register"
  | "checkout"
  | "identity"
  | "search"
  | "unknown";

export type AutofillQueryMessage = {
  type: typeof AUTOFILL_MSG.query;
  pageUrl: string;
  /** Detected semantic field kinds on the page / focused form (drives non-login suggestions). */
  fieldKinds?: string[];
  /** Form-type heuristics — filters categories (e.g. login never suggests personal_data). */
  formType?: AutofillFormTypeMessage;
};

export type AutofillFillMessage = {
  type: typeof AUTOFILL_MSG.fill;
  itemId: string;
  pageUrl: string;
  fillOverrides?: Record<string, string>;
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
  vaultId?: string;
  /** When set, update this existing login instead of creating a new one. */
  itemId?: string;
};

export type AutofillSaveOfferMessage = {
  type: typeof AUTOFILL_MSG.saveOffer;
  pageUrl: string;
  username: string;
  password: string;
};

export type AutofillSaveContextMessage = {
  type: typeof AUTOFILL_MSG.saveContext;
};

export type AutofillSiteIconMessage = {
  type: typeof AUTOFILL_MSG.siteIcon;
  websiteUrl: string;
};

export type AutofillSiteIconResponse =
  | { status: "signed-out" | "locked" | "missing" }
  | { status: "ok"; iconUrl: string };

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

export type AutofillPendingSaveSetMessage = {
  type: typeof AUTOFILL_MSG.pendingSaveSet;
  username: string;
  password: string;
  captureUrl: string;
};

export type AutofillPendingSaveGetMessage = {
  type: typeof AUTOFILL_MSG.pendingSaveGet;
};

export type AutofillPendingSaveClearMessage = {
  type: typeof AUTOFILL_MSG.pendingSaveClear;
};

export type AutofillPendingSaveMarkInteractedMessage = {
  type: typeof AUTOFILL_MSG.pendingSaveMarkInteracted;
  currentUrl: string;
};

export type AutofillPendingSaveGetResponse =
  | { status: "none" }
  | { status: "ok"; pending: AutofillPendingSavePayload };

export type AutofillRuntimeMessage =
  | AutofillQueryMessage
  | AutofillFillMessage
  | AutofillUnlockMessage
  | AutofillUnlockedMessage
  | AutofillSaveMessage
  | AutofillSaveOfferMessage
  | AutofillSaveContextMessage
  | AutofillSiteIconMessage
  | AutofillOpenAndFillMessage
  | AutofillApplyFillMessage
  | AutofillPendingSaveSetMessage
  | AutofillPendingSaveGetMessage
  | AutofillPendingSaveClearMessage
  | AutofillPendingSaveMarkInteractedMessage;
