import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import SelfHostedFreePlanSection from "./SelfHostedFreePlanSection";

const { getStatus, requestChange, useCore, readSentAt, writeSentAt } = vi.hoisted(() => ({
  getStatus: vi.fn(),
  requestChange: vi.fn(),
  useCore: vi.fn(),
  readSentAt: vi.fn((): string | null => null),
  writeSentAt: vi.fn(),
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

vi.mock("./licenseRequestSentAtStorage", () => ({
  readLicenseRequestSentAt: (...args: unknown[]) => readSentAt(...args),
  writeLicenseRequestSentAt: (...args: unknown[]) => writeSentAt(...args),
  formatLicenseRequestSentAt: (iso: string) => `fmt:${iso}`,
}));

describe("SelfHostedFreePlanSection", () => {
  beforeEach(() => {
    getStatus.mockReset();
    requestChange.mockReset();
    useCore.mockReset();
    useCore.mockReturnValue(null);
    readSentAt.mockReset();
    readSentAt.mockReturnValue(null);
    writeSentAt.mockReset();
  });

  it("shows FREE note + enterprise info CTA even when planTier prop is ENTERPRISE", () => {
    render(
      <SelfHostedFreePlanSection
        workspaceId="ws-1"
        planTier="ENTERPRISE"
        canRequest
        t={(key) => key}
      />,
    );

    expect(screen.getByText("web.workspaceSettings.plan.selfHosted.freeTitle")).toBeInTheDocument();
    expect(screen.getByText("plan.enterprise")).toBeInTheDocument();
    expect(
      screen.getByText("web.workspaceSettings.plan.selfHosted.requestStatusIdle"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "web.workspaceSettings.plan.selfHosted.requestCta" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("web.workspaceSettings.plan.selfHosted.nonFreeTitle"),
    ).not.toBeInTheDocument();
  });

  it("opens the same popup on mailto path (reply email + members) then mailto", async () => {
    let mailtoHref = "";
    const locationStub = {
      origin: "http://localhost",
      get href() {
        return mailtoHref || "http://localhost/";
      },
      set href(value: string) {
        mailtoHref = value;
      },
    };
    vi.stubGlobal("location", locationStub);

    render(
      <SelfHostedFreePlanSection
        workspaceId="ws-1"
        planTier="FREE"
        canRequest
        t={(key) => key}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "web.workspaceSettings.plan.selfHosted.requestCta" }),
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getAllByText("web.workspaceSettings.plan.selfHosted.requestTitle").length,
    ).toBeGreaterThan(0);

    const email = screen.getByLabelText("web.workspaceSettings.plan.request.emailLabel");
    fireEvent.change(email, { target: { value: "reply@okkey.local" } });
    const members = screen.getByLabelText("web.workspaceSettings.plan.request.memberCountLabel");
    fireEvent.change(members, { target: { value: "7" } });
    fireEvent.click(
      screen.getByRole("button", { name: "web.workspaceSettings.plan.selfHosted.requestSubmit" }),
    );

    expect(mailtoHref.startsWith("mailto:get-license@okkey.io?")).toBe(true);
    expect(mailtoHref).toContain("Members%3A%207");
    expect(mailtoHref).toContain("Reply%20email%3A%20reply%40okkey.local");
    expect(mailtoHref).not.toMatch(/[?&](?:subject|body)=[^&]*\+/);
    expect(
      screen.getByText(/web\.workspaceSettings\.plan\.selfHosted\.requestStatusSent/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "web.workspaceSettings.plan.request.sendAgain" }),
    ).toBeInTheDocument();

    vi.unstubAllGlobals();
  });

  it("shows sent status with send-again when SMTP deliverable and submitted", async () => {
    getStatus.mockResolvedValue({
      submitted: true,
      sent_at: "2026-10-22T12:00:00.000Z",
      sales_email_deliverable: true,
      sales_email: "get-license@okkey.io",
    });
    useCore.mockReturnValue({
      getWorkspacePlanChangeRequestStatus: getStatus,
      requestWorkspacePlanChange: requestChange,
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
        screen.getByText(/web\.workspaceSettings\.plan\.selfHosted\.requestStatusSent/),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByRole("button", { name: "web.workspaceSettings.plan.request.sendAgain" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "web.workspaceSettings.plan.selfHosted.requestCta" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("web.workspaceSettings.plan.request.successTitle"),
    ).not.toBeInTheDocument();
  });

  it("reopens full SMTP form on send again and allows another API submit", async () => {
    getStatus.mockResolvedValue({
      submitted: true,
      sent_at: "2026-10-22T12:00:00.000Z",
      sales_email_deliverable: true,
      sales_email: "get-license@okkey.io",
    });
    requestChange.mockResolvedValue({ submitted: true });
    useCore.mockReturnValue({
      getWorkspacePlanChangeRequestStatus: getStatus,
      requestWorkspacePlanChange: requestChange,
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
        screen.getByRole("button", { name: "web.workspaceSettings.plan.request.sendAgain" }),
      ).toBeEnabled();
    });

    fireEvent.click(
      screen.getByRole("button", { name: "web.workspaceSettings.plan.request.sendAgain" }),
    );

    const email = screen.getByLabelText("web.workspaceSettings.plan.request.emailLabel");
    fireEvent.change(email, { target: { value: "reply@okkey.local" } });
    fireEvent.change(screen.getByLabelText("web.workspaceSettings.plan.request.memberCountLabel"), {
      target: { value: "3" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "web.workspaceSettings.plan.selfHosted.requestSubmit" }),
    );

    await waitFor(() => {
      expect(requestChange).toHaveBeenCalledWith(
        "ws-1",
        expect.objectContaining({
          contact_email: "reply@okkey.local",
          workspace_member_count: 3,
        }),
      );
    });
  });
});
