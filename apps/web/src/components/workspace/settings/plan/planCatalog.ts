import {
  normalizePlanTier,
  planTiersForCatalogGroup,
  type PlanCatalogGroup,
  type PlanTier,
} from "@okkey/types";

/** Marketing feature row keys under `web.workspaceSettings.plan.features.*`. */
export type PlanFeatureRowId =
  | "unlimitedItems"
  | "itemCategories"
  | "personalVaultOnly"
  | "textItemsOnly"
  | "totpImportExport"
  | "everythingInFree"
  | "filesInItems"
  | "storage5gb"
  | "shareItem"
  | "securityReport"
  | "leakMonitoring"
  | "emergencyAccess"
  | "everythingInPremium"
  | "upTo6Members"
  | "unlimitedVaults"
  | "builtInRoles"
  | "builtInProfiles"
  | "everythingInFamily"
  | "upTo25Members"
  | "sharedVaults50"
  | "storage100gb"
  | "customRoles"
  | "customProfiles"
  | "everythingInTeam"
  | "unlimitedMembers"
  | "unlimitedSharedVaults"
  | "unlimitedStorage"
  | "prioritySupport";

export type PlanCatalogCard = {
  tier: PlanTier;
  /** Pricing period line under the main price (`forever` | `yearly` | `onRequest`). */
  priceHint: "forever" | "yearly" | "onRequest";
  /** Whether the card shows “*Billed yearly” footnote. */
  yearlyFootnote: boolean;
  featureRows: readonly PlanFeatureRowId[];
};

const PERSONAL_CARDS: readonly PlanCatalogCard[] = [
  {
    tier: "FREE",
    priceHint: "forever",
    yearlyFootnote: false,
    featureRows: [
      "unlimitedItems",
      "itemCategories",
      "personalVaultOnly",
      "textItemsOnly",
      "totpImportExport",
    ],
  },
  {
    tier: "PREMIUM",
    priceHint: "yearly",
    yearlyFootnote: true,
    featureRows: [
      "everythingInFree",
      "filesInItems",
      "storage5gb",
      "shareItem",
      "securityReport",
      "leakMonitoring",
      "emergencyAccess",
    ],
  },
  {
    tier: "FAMILY",
    priceHint: "yearly",
    yearlyFootnote: true,
    featureRows: [
      "everythingInPremium",
      "upTo6Members",
      "unlimitedVaults",
      "builtInRoles",
      "builtInProfiles",
    ],
  },
] as const;

const BUSINESS_CARDS: readonly PlanCatalogCard[] = [
  {
    tier: "FREE",
    priceHint: "forever",
    yearlyFootnote: false,
    featureRows: [
      "unlimitedItems",
      "itemCategories",
      "personalVaultOnly",
      "textItemsOnly",
      "totpImportExport",
    ],
  },
  {
    tier: "TEAM",
    priceHint: "yearly",
    yearlyFootnote: true,
    featureRows: [
      "everythingInFamily",
      "upTo25Members",
      "sharedVaults50",
      "storage100gb",
      "customRoles",
      "customProfiles",
    ],
  },
  {
    tier: "ENTERPRISE",
    priceHint: "onRequest",
    yearlyFootnote: false,
    featureRows: [
      "everythingInTeam",
      "unlimitedMembers",
      "unlimitedSharedVaults",
      "unlimitedStorage",
      "prioritySupport",
    ],
  },
] as const;

export function planCatalogCardsForGroup(group: PlanCatalogGroup): readonly PlanCatalogCard[] {
  return group === "business" ? BUSINESS_CARDS : PERSONAL_CARDS;
}

export function defaultPlanCatalogGroup(planTier: string | null | undefined): PlanCatalogGroup {
  const tier = normalizePlanTier(planTier);
  return planTiersForCatalogGroup("business").includes(tier) ? "business" : "personal";
}
