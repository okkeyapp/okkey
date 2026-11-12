import { render, screen, waitFor } from "@testing-library/react";
import type { Workspace } from "@okkey/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

import WorkspaceSettingsGeneralSection from "./WorkspaceSettingsGeneralSection";

const coreMock = vi.hoisted(() => ({
  getWorkspaceSettings: vi.fn(),
  listWorkspaceMemberDirectory: vi.fn(),
  getServerMailSettings: vi.fn(),
}));

const authState = vi.hoisted(() => ({ userId: "owner-1" }));

vi.mock("../../../auth/AuthVaultContext", () => ({
  useAuthenticatedCoreClient: () => coreMock,
  useAuthVault: () => ({
    userId: authState.userId,
    accessToken: "token",
    vaultKey: null,
  }),
}));

const workspace = {
  id: "1000000000000000100",
  name: "Acme",
  ownerId: "owner-1",
  planTier: "FREE",
} as Workspace;

const t = (key: string) => key;

function settingsResponse() {
  return {
    name: "Acme",
    deleted_items_retention_days: 30,
    allowed_file_extensions: [],
    max_file_size_mb: 25,
    files_in_items_enabled: true,
    capsule_policies: {},
    tile_color: null,
    logo_vault_id: null,
    logo_attachment_id: null,
  };
}

function mailResponse() {
  return {
    smtp_host: "smtp.example.com",
    smtp_port: 587,
    smtp_tls_mode: "starttls" as const,
    smtp_username: "mailer",
    email_from: "no-reply@example.com",
    public_app_url: "https://vault.example",
    password_set: true,
    password_unreadable: false,
  };
}

describe("server mail settings visibility", () => {
  beforeEach(() => {
    authState.userId = "owner-1";
    coreMock.getWorkspaceSettings.mockResolvedValue(settingsResponse());
    coreMock.listWorkspaceMemberDirectory.mockResolvedValue({ members: [] });
    coreMock.getServerMailSettings.mockResolvedValue(mailResponse());
    vi.stubEnv("VITE_DEPLOYMENT_MODE", "saas");
  });

  it("hides the block on SaaS even for the workspace owner", async () => {
    render(
      <WorkspaceSettingsGeneralSection
        workspaceId={workspace.id}
        workspace={workspace}
        vaults={[]}
        t={t}
      />,
    );
    expect(await screen.findByLabelText("web.workspaceSettings.general.nameLabel")).toBeInTheDocument();
    expect(screen.queryByTestId("server-mail-settings")).not.toBeInTheDocument();
    expect(coreMock.getServerMailSettings).not.toHaveBeenCalled();
  });

  it("hides the block from a non-owner on self-host", async () => {
    vi.stubEnv("VITE_DEPLOYMENT_MODE", "self_hosted");
    authState.userId = "member-2";
    render(
      <WorkspaceSettingsGeneralSection
        workspaceId={workspace.id}
        workspace={workspace}
        vaults={[]}
        t={t}
      />,
    );
    expect(await screen.findByLabelText("web.workspaceSettings.general.nameLabel")).toBeInTheDocument();
    expect(screen.queryByTestId("server-mail-settings")).not.toBeInTheDocument();
    expect(coreMock.getServerMailSettings).not.toHaveBeenCalled();
  });

  it("shows the server-wide block to the owner on self-host", async () => {
    vi.stubEnv("VITE_DEPLOYMENT_MODE", "self_hosted");
    render(
      <WorkspaceSettingsGeneralSection
        workspaceId={workspace.id}
        workspace={workspace}
        vaults={[]}
        t={t}
      />,
    );
    expect(await screen.findByTestId("server-mail-settings")).toBeInTheDocument();
    expect(await screen.findByText("web.workspaceSettings.serverMail.caption")).toBeInTheDocument();
    expect(await screen.findByLabelText("web.workspaceSettings.serverMail.smtpHost")).toHaveValue(
      "smtp.example.com",
    );
    expect(screen.getByLabelText("web.workspaceSettings.serverMail.smtpPort")).toHaveValue("587");
    expect(screen.getByLabelText("web.workspaceSettings.serverMail.username")).toHaveValue("mailer");
    expect(screen.getByLabelText("web.workspaceSettings.serverMail.password")).toHaveValue("");
    expect(screen.getByLabelText("web.workspaceSettings.serverMail.emailFrom")).toHaveValue(
      "no-reply@example.com",
    );
    expect(screen.getByLabelText("web.workspaceSettings.serverMail.publicAppUrl")).toHaveValue(
      "https://vault.example",
    );
    expect(screen.getByRole("button", { name: "web.workspaceSettings.serverMail.test" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "web.workspaceSettings.serverMail.clearPassword" })).toBeInTheDocument();
    expect(screen.queryByTestId("server-mail-password-unreadable")).not.toBeInTheDocument();
    await waitFor(() => {
      expect(coreMock.getServerMailSettings).toHaveBeenCalledWith(workspace.id);
    });
  });

  it("shows a notice when the saved SMTP password cannot be read", async () => {
    vi.stubEnv("VITE_DEPLOYMENT_MODE", "self_hosted");
    coreMock.getServerMailSettings.mockResolvedValue({
      ...mailResponse(),
      password_set: false,
      password_unreadable: true,
    });
    render(
      <WorkspaceSettingsGeneralSection
        workspaceId={workspace.id}
        workspace={workspace}
        vaults={[]}
        t={t}
      />,
    );
    expect(await screen.findByTestId("server-mail-password-unreadable")).toHaveTextContent(
      "web.workspaceSettings.serverMail.passwordUnreadable",
    );
  });
});
