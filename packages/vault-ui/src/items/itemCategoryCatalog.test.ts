import { describe, expect, it } from "vitest";

import {
  ITEM_CATEGORY_DEFINITIONS,
  ITEM_CATEGORY_GROUP_PERSONAL,
  categoriesForGroup,
  getItemCategoryDefinition,
  isItemCategoryId,
  itemCategoryIdToPopupSlug,
  popupSlugToItemCategoryId,
} from "./itemCategoryCatalog.js";

describe("itemCategoryCatalog TSK-140 categories", () => {
  it("registers loyalty_card, vehicle, and travel_booking in the catalog", () => {
    expect(isItemCategoryId("loyalty_card")).toBe(true);
    expect(isItemCategoryId("vehicle")).toBe(true);
    expect(isItemCategoryId("travel_booking")).toBe(true);

    expect(getItemCategoryDefinition("loyalty_card")).toMatchObject({
      id: "loyalty_card",
      groupId: ITEM_CATEGORY_GROUP_PERSONAL,
      iconColor: "#db2777",
    });
    expect(getItemCategoryDefinition("vehicle")).toMatchObject({
      id: "vehicle",
      groupId: ITEM_CATEGORY_GROUP_PERSONAL,
      iconColor: "#475569",
    });
    expect(getItemCategoryDefinition("travel_booking")).toMatchObject({
      id: "travel_booking",
      groupId: ITEM_CATEGORY_GROUP_PERSONAL,
      iconColor: "#0284c8",
    });

    const personalIds = categoriesForGroup(ITEM_CATEGORY_GROUP_PERSONAL).map((category) => category.id);
    expect(personalIds).toEqual([
      "personal_data",
      "passport",
      "loyalty_card",
      "vehicle",
      "travel_booking",
      "secure_files",
      "secure_note",
    ]);

    expect(ITEM_CATEGORY_DEFINITIONS.some((category) => category.id === "loyalty_card")).toBe(true);
  });

  it("maps popup slugs for the new categories", () => {
    expect(itemCategoryIdToPopupSlug("loyalty_card")).toBe("loyaltyCard");
    expect(itemCategoryIdToPopupSlug("travel_booking")).toBe("travelBooking");
    expect(popupSlugToItemCategoryId("loyaltyCard")).toBe("loyalty_card");
    expect(popupSlugToItemCategoryId("vehicle")).toBe("vehicle");
    expect(popupSlugToItemCategoryId("travelBooking")).toBe("travel_booking");
  });
});
