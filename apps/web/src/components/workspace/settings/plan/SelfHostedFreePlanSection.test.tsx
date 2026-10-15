import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import SelfHostedFreePlanSection from "./SelfHostedFreePlanSection";

vi.mock("../../../../auth/AuthVaultContext", () => ({
  useAuthenticatedCoreClient: () => null,
}));

vi.mock("./usePlanRequestProfile", () => ({
  usePlanRequestProfile: () => ({
    locale: "en" as const,
    region: null,
    email: "sasha@okkey.local",
  }),
}));

describe("SelfHostedFreePlanSection", () => {
  it("shows FREE notice and sales CTA even when planTier prop is ENTERPRISE", () => {
    render(
      <SelfHostedFreePlanSection
        workspaceId="ws-1"
        planTier="ENTERPRISE"
        canRequest
        t={(key) => key}
      />,
    );

    expect(screen.getByText("web.workspaceSettings.plan.selfHosted.freeTitle")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "web.workspaceSettings.plan.selfHosted.requestCta" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("web.workspaceSettings.plan.selfHosted.nonFreeTitle"),
    ).not.toBeInTheDocument();
  });
});
