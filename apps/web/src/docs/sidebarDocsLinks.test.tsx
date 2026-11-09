import { render, screen } from "@testing-library/react";
import { OkkeyAppSidebar } from "@okkey/ui";
import { afterEach, describe, expect, it } from "vitest";

import { publicDocsUrl } from "./publicDocsUrl";

const SIDEBAR_EXPANDED_KEY = "okkey.appShell.sidebarExpanded";

function renderSidebar(locale: "en" | "ru", expanded: boolean) {
  localStorage.setItem(SIDEBAR_EXPANDED_KEY, expanded ? "true" : "false");
  return render(
    <OkkeyAppSidebar
      docsLocale={locale}
      footerPlainLinkLabels={{ documentation: "Documentation", help: "Help" }}
    />,
  );
}

function expectFooterDocsLink(
  name: "Documentation" | "Help",
  locale: "en" | "ru",
  expanded: boolean,
) {
  const link = screen.getByRole("link", { name });
  const href = link.getAttribute("href") ?? "";
  expect(link.tagName).toBe("A");
  expect(href).toBe(publicDocsUrl("home", locale));
  expect(link).toHaveAttribute("target", "_blank");
  expect(link.getAttribute("rel")).toContain("noopener");
  expect(link.getAttribute("rel")).toContain("noreferrer");
  expect(href.startsWith("#")).toBe(false);
  expect(href.includes("javascript:")).toBe(false);
  expect(href.length).toBeGreaterThan(0);
  expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
  if (expanded) {
    expect(link.querySelector(".sr-only")).toBeNull();
  } else {
    expect(link.querySelector(".sr-only")).not.toBeNull();
  }
}

describe("sidebar Documentation and Help", () => {
  afterEach(() => {
    localStorage.removeItem(SIDEBAR_EXPANDED_KEY);
  });

  it.each([
    ["en", true],
    ["en", false],
    ["ru", true],
    ["ru", false],
  ] as const)("opens both footer items for %s when expanded=%s", (locale, expanded) => {
    const view = renderSidebar(locale, expanded);
    expectFooterDocsLink("Documentation", locale, expanded);
    expectFooterDocsLink("Help", locale, expanded);
    view.unmount();
  });
});
