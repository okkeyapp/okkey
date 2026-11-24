import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";

import MembersSectionHeader from "../components/workspace/settings/members/MembersSectionHeader";
import ProfilesSectionHeader from "../components/workspace/settings/profiles/ProfilesSectionHeader";
import RolesSectionHeader from "../components/workspace/settings/roles/RolesSectionHeader";
import VaultsSectionHeader from "../components/workspace/settings/vaults/VaultsSectionHeader";
import { LocaleProvider, useLocale } from "../locale/LocaleContext";
import { writeStoredLocale } from "../locale/localeStorage";
import { publicDocsUrl, type PublicDocsTopic } from "./publicDocsUrl";

const headers: Array<{
  topic: PublicDocsTopic;
  render: (t: (key: string) => string) => ReactNode;
}> = [
  { topic: "roles", render: (t) => <RolesSectionHeader t={t} /> },
  { topic: "members", render: (t) => <MembersSectionHeader t={t} /> },
  { topic: "profiles", render: (t) => <ProfilesSectionHeader t={t} /> },
  { topic: "workspaceVaults", render: (t) => <VaultsSectionHeader t={t} /> },
];

function labelT(key: string): string {
  return key.endsWith(".learnMore") ? "Learn more" : key;
}

function renderHeader(node: ReactNode) {
  return render(<LocaleProvider>{node}</LocaleProvider>);
}

describe("Learn more docs links", () => {
  it("opens each settings header on the English docs section in a new tab", () => {
    for (const header of headers) {
      const view = renderHeader(header.render(labelT));
      const link = screen.getByRole("link", { name: "Learn more" });
      expect(link).toHaveAttribute("href", publicDocsUrl(header.topic, "en"));
      expect(link).toHaveAttribute("target", "_blank");
      expect(link.getAttribute("rel")).toContain("noopener");
      view.unmount();
    }
  });

  it("follows a locale switch from English to Russian", () => {
    writeStoredLocale("en");

    function Harness() {
      const { setLocale } = useLocale();
      return (
        <>
          <button type="button" onClick={() => setLocale("ru")}>
            Use Russian
          </button>
          <RolesSectionHeader t={labelT} />
        </>
      );
    }

    renderHeader(<Harness />);
    expect(screen.getByRole("link", { name: "Learn more" })).toHaveAttribute(
      "href",
      publicDocsUrl("roles", "en"),
    );

    fireEvent.click(screen.getByRole("button", { name: "Use Russian" }));
    const link = screen.getByRole("link", { name: "Learn more" });
    expect(link).toHaveAttribute("href", publicDocsUrl("roles", "ru"));
    expect(link.getAttribute("href")).toContain("/workspace/roles");
    expect(link.getAttribute("href")).not.toContain("#");
  });
});
