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
    ...overrides,
  };
}

describe("ServerMailSettingsBlock", () => {
  beforeEach(() => {
    coreMock.getServerMailSettings.mockResolvedValue(mailResponse());
    coreMock.updateServerMailSettings.mockResolvedValue(mailResponse());
    coreMock.sendServerMailTestEmail.mockResolvedValue({ ok: true });
  });

  it("shows row layout with change-password when a password is saved", async () => {
    render(<ServerMailSettingsBlock workspaceId={workspaceId} t={t} canPut />);
    expect(await screen.findByTestId("server-mail-settings")).toBeInTheDocument();
    expect(screen.getByText("web.workspaceSettings.sections.mail")).toBeInTheDocument();
    expect(screen.getByLabelText("web.workspaceSettings.serverMail.smtpHost")).toHaveValue(
      "smtp.example.com",
    );
    expect(screen.getByLabelText("web.workspaceSettings.serverMail.smtpPort")).toHaveValue("587");
    expect(screen.getByLabelText("web.workspaceSettings.serverMail.username")).toHaveValue("mailer");
    expect(screen.getByTestId("server-mail-change-password")).toBeInTheDocument();
    expect(screen.queryByLabelText("web.workspaceSettings.serverMail.password")).not.toBeInTheDocument();
    expect(screen.getByTestId("server-mail-test")).toBeInTheDocument();
    await waitFor(() => {
      expect(coreMock.getServerMailSettings).toHaveBeenCalledWith(workspaceId);
    });
  });

  it("opens an empty password field when changing password", async () => {
    render(<ServerMailSettingsBlock workspaceId={workspaceId} t={t} canPut />);
    fireEvent.click(await screen.findByTestId("server-mail-change-password"));
    const input = screen.getByLabelText("web.workspaceSettings.serverMail.password");
    expect(input).toHaveValue("");
    expect(input).toHaveFocus();
  });

  it("shows a notice when the saved SMTP password cannot be read", async () => {
    coreMock.getServerMailSettings.mockResolvedValue(
      mailResponse({
        password_set: false,
        password_unreadable: true,
      }),
    );
    render(<ServerMailSettingsBlock workspaceId={workspaceId} t={t} canPut />);
    expect(await screen.findByTestId("server-mail-password-unreadable")).toHaveTextContent(
      "web.workspaceSettings.serverMail.passwordUnreadable",
    );
    expect(screen.getByLabelText("web.workspaceSettings.serverMail.password")).toBeInTheDocument();
  });
});
