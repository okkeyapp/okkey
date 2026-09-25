import { webBundles } from "@okkey/i18n";
import { describe, expect, it } from "vitest";

import { planCatalogCardsForGroup, type PlanFeatureRowId } from "./planCatalog";

const INCLUSION_HEADERS = new Set<PlanFeatureRowId>([
  "everythingInFree",
  "everythingInPremium",
  "everythingInFamily",
  "everythingInTeam",
]);

function catalogFeatureIds(): PlanFeatureRowId[] {
  const ids = new Set<PlanFeatureRowId>();
  for (const group of ["personal", "business"] as const) {
    for (const card of planCatalogCardsForGroup(group)) {
      for (const featureId of card.featureRows) {
        ids.add(featureId);
      }
    }
  }
  return [...ids];
}

describe("plan catalog i18n", () => {
  it("has features.* and featureHints.* for every catalog row in en/ru", () => {
    for (const featureId of catalogFeatureIds()) {
      const featureKey = `web.workspaceSettings.plan.features.${featureId}`;
      expect(webBundles.en[featureKey], `en ${featureKey}`).toEqual(expect.any(String));
      expect(webBundles.ru[featureKey], `ru ${featureKey}`).toEqual(expect.any(String));

      const hintKey = `web.workspaceSettings.plan.featureHints.${featureId}`;
      // Inclusion headers omit tooltips in UI, but keys must still exist so `t()` never throws.
      expect(webBundles.en[hintKey], `en ${hintKey}`).toEqual(expect.any(String));
      expect(webBundles.ru[hintKey], `ru ${hintKey}`).toEqual(expect.any(String));
      if (!INCLUSION_HEADERS.has(featureId)) {
        expect(webBundles.en[hintKey].trim().length).toBeGreaterThan(0);
        expect(webBundles.ru[hintKey].trim().length).toBeGreaterThan(0);
      }
    }
  });
});
