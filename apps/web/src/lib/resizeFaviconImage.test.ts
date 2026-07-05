import { describe, expect, it } from "vitest";

import { FAVICON_IMAGE_SIZE_PX, isAcceptedFaviconImageFile } from "./resizeFaviconImage";

describe("resizeFaviconImage", () => {
  it("accepts jpg and png mime types", () => {
    expect(isAcceptedFaviconImageFile(new File(["x"], "icon.png", { type: "image/png" }))).toBe(true);
    expect(isAcceptedFaviconImageFile(new File(["x"], "icon.jpg", { type: "image/jpeg" }))).toBe(true);
    expect(isAcceptedFaviconImageFile(new File(["x"], "icon.gif", { type: "image/gif" }))).toBe(false);
  });

  it("exports favicon size constant", () => {
    expect(FAVICON_IMAGE_SIZE_PX).toBe(80);
  });
});
