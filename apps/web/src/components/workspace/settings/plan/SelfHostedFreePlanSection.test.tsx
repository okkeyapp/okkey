import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import SelfHostedFreePlanSection from "./SelfHostedFreePlanSection";

const { getStatus, useCore } = vi.hoisted(() => ({
  getStatus: vi.fn(),
  useCore: vi.fn(),
}));

vi.mock("../../../../auth/AuthVaultContext", () => ({
  useAuthenticatedCoreClient: () => useCore(),
}));

vi.mock("./usePlanRequestProfile", () => ({
  usePlanRequestProfile: () => ({
    locale: "en" as const,
    region: null,
    email: "sasha@okkey.local",
  }),
}));

describe("SelfHostedFreePlanSection", () => {
  beforeEach(() => {
    getStatus.mockReset();
    useCore.mockReset();
    useCore.mockReturnValue(null);
  });

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

  it("does not mount the request form popup when core client is unavailable (mailto path)", () => {
    render(
      <SelfHostedFreePlanSection
        workspaceId="ws-1"
        planTier="FREE"
        canRequest
        t={(key) => key}
      />,
    );

    expect(
      screen.queryByText("web.workspaceSettings.plan.selfHosted.requestTitle"),
    ).not.toBeInTheDocument();
  });

  it("keeps mailto CTA when not deliverable even if submitted flag is set", async () => {
    getStatus.mockResolvedValue({
      submitted: true,
      sent_at: "2026-10-22T12:00:00.000Z",
      sales_email_deliverable: false,
      sales_email: "get-license@okkey.io",
    });
    useCore.mockReturnValue({
      getWorkspacePlanChangeRequestStatus: getStatus,
      requestWorkspacePlanChange: vi.fn(),
    });

    render(
      <SelfHostedFreePlanSection
        workspaceId="ws-1"
        planTier="FREE"
        canRequest
        t={(key) => key}
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "web.workspaceSettings.plan.selfHosted.requestCta" }),
      ).toBeEnabled();
    });
    expect(
      screen.queryByText("web.workspaceSettings.plan.selfHosted.alreadySentTitle"),
    ).not.toBeInTheDocument();
  });

  it("shows already-sent only when SMTP deliverable and submitted", async () => {
    getStatus.mockResolvedValue({
      submitted: true,
      sent_at: "2026-10-22T12:00:00.000Z",
      sales_email_deliverable: true,
      sales_email: "get-license@okkey.io",
    });
    useCore.mockReturnValue({
      getWorkspacePlanChangeRequestStatus: getStatus,
      requestWorkspacePlanChange: vi.fn(),
    });

    render(
      <SelfHostedFreePlanSection
        workspaceId="ws-1"
        planTier="FREE"
        canRequest
        t={(key) => key}
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByText("web.workspaceSettings.plan.selfHosted.alreadySentTitle"),
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByRole("button", { name: "web.workspaceSettings.plan.selfHosted.requestCta" }),
    ).not.toBeInTheDocument();
  });
});
