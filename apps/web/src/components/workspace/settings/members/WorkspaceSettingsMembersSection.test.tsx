import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import WorkspaceSettingsMembersSection from "./WorkspaceSettingsMembersSection";

vi.mock("../../../../auth/AuthVaultContext", () => ({
  useAuthenticatedCoreClient: () => null,
  useAuthVault: () => ({ userId: "u1", vaultKey: null }),
}));

vi.mock("../../../../locale/LocaleContext", () => ({
  useLocale: () => ({ locale: "ru", t: (key: string) => key }),
}));

const t = (key: string) => {
  const map: Record<string, string> = {
    "web.workspaceSettings.members.title": "Участники пространства",
    "web.workspaceSettings.members.intro": "Intro",
    "web.workspaceSettings.members.learnMore": "Подробнее",
    "web.workspaceSettings.members.learnMoreUrl": "https://example.com",
    "web.workspaceSettings.members.loading": "Loading…",
  };
  return map[key] ?? key;
};

describe("WorkspaceSettingsMembersSection", () => {
  it("renders header while loading", () => {
    render(
      <MemoryRouter>
        <WorkspaceSettingsMembersSection workspaceId="w1" t={t} />
      </MemoryRouter>,
    );
    expect(screen.getByText("Участники пространства")).toBeTruthy();
  });
});
