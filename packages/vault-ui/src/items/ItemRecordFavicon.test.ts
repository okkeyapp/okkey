import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import ItemRecordFavicon from "./ItemRecordFavicon.js";

function html(props: { categoryId: string; title?: string }): string {
  return renderToStaticMarkup(createElement(ItemRecordFavicon, props));
}

describe("ItemRecordFavicon initials", () => {
  it("paints two initials for a two-word login title (QA favicon tile)", () => {
    expect(html({ categoryId: "login", title: "Git Hub" })).toContain("GH");
  });

  it("paints the first two letters for a one-word login title (QA favicon tile)", () => {
    expect(html({ categoryId: "login", title: "Okkey" })).toContain("OK");
  });

  it("does not invent initials for an empty login title (QA favicon tile)", () => {
    const markup = html({ categoryId: "login", title: "   " });
    expect(markup).not.toContain(">GH<");
    expect(markup).not.toContain(">OK<");
  });
});
