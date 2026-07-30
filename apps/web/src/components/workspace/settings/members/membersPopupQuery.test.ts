import { describe, expect, it } from "vitest";

import {
  EDIT_MEMBER_POPUP_ID,
  INVITE_MEMBERS_POPUP_ID,
  buildPopupQueryValue,
  parsePopupQueryValue,
} from "../../../../routes/popupQuery";

describe("members popup query", () => {
  it("builds and parses invite/edit member popup values", () => {
    expect(INVITE_MEMBERS_POPUP_ID).toBe("inviteMembers");
    expect(EDIT_MEMBER_POPUP_ID).toBe("editMember");
    expect(buildPopupQueryValue(EDIT_MEMBER_POPUP_ID, "123")).toBe("editMember|123");
    expect(parsePopupQueryValue("editMember|123")).toEqual({
      popupId: "editMember",
      menuItemId: "123",
    });
    expect(parsePopupQueryValue("inviteMembers")).toEqual({
      popupId: "inviteMembers",
      menuItemId: undefined,
    });
  });
});
