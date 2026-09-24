import { describe, expect, it } from "vitest";

import { OKKEY_Z_INDEX } from "./z-index.js";

describe("OKKEY_Z_INDEX", () => {
  it("keeps stacking order: sidebar < popup < nested < floating < tooltip < lightbox", () => {
    expect(OKKEY_Z_INDEX.sidebarOverlay).toBeLessThan(OKKEY_Z_INDEX.sidebar);
    expect(OKKEY_Z_INDEX.sidebar).toBeLessThan(OKKEY_Z_INDEX.popup);
    expect(OKKEY_Z_INDEX.popup).toBeLessThan(OKKEY_Z_INDEX.popupNested);
    expect(OKKEY_Z_INDEX.popupNested).toBeLessThan(OKKEY_Z_INDEX.popupNestedHigh);
    expect(OKKEY_Z_INDEX.popupNestedHigh).toBeLessThan(OKKEY_Z_INDEX.floating);
    expect(OKKEY_Z_INDEX.floating).toBeLessThan(OKKEY_Z_INDEX.tooltip);
    expect(OKKEY_Z_INDEX.tooltip).toBeLessThan(OKKEY_Z_INDEX.lightbox);
  });
});
