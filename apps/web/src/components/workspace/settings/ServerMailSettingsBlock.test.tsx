import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ServerMailSettingsBlock from "./ServerMailSettingsBlock";

const coreMock = vi.hoisted(() => ({
  getServerMailSettings: vi.fn(),
  updateServerMailSettings: vi.fn(),
  sendServerMailTestEmail: vi.fn(),
}));

vi.mock("../../../auth/AuthVaultContext", () => ({
  useAuthenticatedCoreClient: () => coreMock,
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    message: vi.fn(),
    promise: vi.fn((action: () => Promise<unknown>) => ({
      unwrap: () => Promise.resolve(action()),
    })),
  },
}));

const workspaceId = "1000000000000000100";
const t = (key: string) => key;

function mailResponse(overrides: Record<string, unknown> = {}) {
  return {
    smtp_host: "smtp.example.com",
    smtp_port: 587,
    smtp_tls_mode: "starttls" as const,
    smtp_username: "mailer",
    email_from: "no-reply@example.com",
    public_app_url: "https://vault.example",
    password_set: true,
    password_unreadable: false,
    smtp_active: true,
    smtp_verified_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("ServerMailSettingsBlock", () => {
  beforeEach(() => {
    coreMock.getServerMailSettings.mockReset();
    coreMock.updateServerMailSettings.mockReset();
    coreMock.sendServerMailTestEmail.mockReset();
    coreMock.getServerMailSettings.mockResolvedValue(mailResponse());
    coreMock.updateServerMailSettings.mockResolvedValue(
      mailResponse({ smtp_active: false, smtp_verified_at: null }),
    );
    coreMock.sendServerMailTestEmail.mockResolvedValue(mailResponse());
  });

  it("shows change-password + clear controls when a password is saved", async () => {
    render(<ServerMailSettingsBlock workspaceId={workspaceId} t={t} canPut />);
    expect(await screen.findByTestId("server-mail-settings")).toBeInTheDocument();
    expect(screen.getByTestId("server-mail-change-password")).toBeInTheDocument();
    expect(screen.getByTestId("server-mail-clear-password")).toBeInTheDocument();
    expect(screen.queryByTestId("server-mail-password")).not.toBeInTheDocument();
    expect(screen.getByTestId("server-mail-status")).toHaveTextContent(
      "web.workspaceSettings.serverMail.statusActive",
    );
  });

  it("keeps the test button enabled and does not autosave on blur", async () => {
    render(<ServerMailSettingsBlock workspaceId={workspaceId} t={t} canPut />);
    const host = await screen.findByLabelText("web.workspaceSettings.serverMail.smtpHost");
    const testButton = screen.getByTestId("server-mail-test");
    expect(testButton).not.toBeDisabled();
    fireEvent.change(host, { target: { value: "smtp.okkey.local" } });
    fireEvent.blur(host);
    expect(coreMock.updateServerMailSettings).not.toHaveBeenCalled();
    expect(testButton).not.toBeDisabled();
  });

  it("collapses the password field back to buttons on blur", async () => {
    render(<ServerMailSettingsBlock workspaceId={workspaceId} t={t} canPut />);
    fireEvent.click(await screen.findByTestId("server-mail-change-password"));
    const password = screen.getByTestId("server-mail-password");
    fireEvent.change(password, { target: { value: "new-secret" } });
    fireEvent.blur(password);
    expect(screen.queryByTestId("server-mail-password")).not.toBeInTheDocument();
    expect(screen.getByTestId("server-mail-change-password")).toBeInTheDocument();
  });

  it("keeps edited values after a successful test save", async () => {
    const { toast } = await import("sonner");
    coreMock.sendServerMailTestEmail.mockImplementation(async (_id, body) =>
      mailResponse({
        smtp_host: body.smtp_host,
        smtp_active: true,
        smtp_verified_at: "2026-02-01T00:00:00.000Z",
      }),
    );
    render(<ServerMailSettingsBlock workspaceId={workspaceId} t={t} canPut />);
    const host = await screen.findByLabelText("web.workspaceSettings.serverMail.smtpHost");
    fireEvent.change(host, { target: { value: "smtp.okkey.local" } });
    fireEvent.click(screen.getByTestId("server-mail-test"));
    await waitFor(() => {
      expect(coreMock.sendServerMailTestEmail).toHaveBeenCalled();
    });
    expect(toast.success).toHaveBeenCalledWith("web.workspaceSettings.serverMail.testSuccess");
    expect(host).toHaveValue("smtp.okkey.local");
  });

  it("shows failed callout and save-anyway after a failed test", async () => {
    coreMock.sendServerMailTestEmail.mockRejectedValue(new Error("connect ECONNREFUSED"));
    coreMock.updateServerMailSettings.mockImplementation(async (_id, body) =>
      mailResponse({
        smtp_host: body.smtp_host,
        smtp_active: false,
        smtp_verified_at: null,
      }),
    );
    render(<ServerMailSettingsBlock workspaceId={workspaceId} t={t} canPut />);
    const host = await screen.findByLabelText("web.workspaceSettings.serverMail.smtpHost");
    fireEvent.change(host, { target: { value: "bad.example" } });
    fireEvent.click(screen.getByTestId("server-mail-test"));
    expect(await screen.findByTestId("server-mail-test-failed")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("server-mail-save-anyway"));
    await waitFor(() => {
      expect(coreMock.updateServerMailSettings).toHaveBeenCalled();
    });
    expect(host).toHaveValue("bad.example");
  });

  it("marks password cleared when trash is pressed", async () => {
    render(<ServerMailSettingsBlock workspaceId={workspaceId} t={t} canPut />);
    fireEvent.click(await screen.findByTestId("server-mail-clear-password"));
    expect(screen.getByTestId("server-mail-password")).toHaveValue("");
    expect(screen.getByTestId("server-mail-test")).not.toBeDisabled();
  });
});
