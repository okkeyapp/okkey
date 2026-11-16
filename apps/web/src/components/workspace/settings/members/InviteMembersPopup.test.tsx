import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import InviteMembersPopup from "./InviteMembersPopup";

const coreMock = vi.hoisted(() => ({
  getServerMailSettings: vi.fn(),
  createWorkspaceInvitations: vi.fn(),
}));

vi.mock("@/lib/saveWithToast", () => ({
  runSaveWithToast: async (
    messages: { success: string | ((value: unknown) => string) },
    action: () => Promise<unknown>,
  ) => {
    const value = await action();
    const success =
      typeof messages.success === "function" ? messages.success(value) : messages.success;
    (globalThis as { __lastInviteToast?: string }).__lastInviteToast = success;
    return value;
  },
}));

const t = (key: string) => key;

const roles = [
  {
    id: "1000000000000000002",
    name: "User",
    description: "",
    kind: "builtin" as const,
    builtinId: "user" as const,
    memberCount: 0,
  },
];

describe("InviteMembersPopup", () => {
  beforeEach(() => {
    coreMock.getServerMailSettings.mockReset();
    coreMock.createWorkspaceInvitations.mockReset();
    delete (globalThis as { __lastInviteToast?: string }).__lastInviteToast;
  });

  it("shows the mail-inactive banner and pending-delivery toast", async () => {
    coreMock.getServerMailSettings.mockResolvedValue({ smtp_active: false });
    coreMock.createWorkspaceInvitations.mockResolvedValue({
      workspaceId: "w1",
      created: [{ invitationId: "i1", email: "a@example.com", roleId: roles[0]!.id }],
      deliveryStatus: "pending",
    });

    render(
      <MemoryRouter>
        <InviteMembersPopup
          popupId="invite"
          workspaceId="1000000000000000100"
          core={coreMock as never}
          roles={roles}
          t={t}
          onClose={() => {}}
          onSent={async () => {}}
        />
      </MemoryRouter>,
    );

    expect(await screen.findByTestId("invite-mail-inactive-banner")).toBeInTheDocument();
    expect(
      screen.getByText("web.workspaceSettings.members.invite.mailInactiveBanner"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: "web.workspaceSettings.members.invite.mailInactiveBannerLink",
      }),
    ).toHaveAttribute("href", "/settings/mail");

    fireEvent.change(screen.getByPlaceholderText("web.workspaceSettings.members.invite.emailPlaceholder"), {
      target: { value: "a@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /web.workspaceSettings.members.invite.submit/ }));

    await waitFor(() => {
      expect(coreMock.createWorkspaceInvitations).toHaveBeenCalled();
    });
    expect((globalThis as { __lastInviteToast?: string }).__lastInviteToast).toBe(
      "web.workspaceSettings.members.invite.savedPendingDelivery",
    );
  });

  it("uses the sent toast when mail is active", async () => {
    coreMock.getServerMailSettings.mockResolvedValue({ smtp_active: true });
    coreMock.createWorkspaceInvitations.mockResolvedValue({
      workspaceId: "w1",
      created: [{ invitationId: "i1", email: "a@example.com", roleId: roles[0]!.id }],
      deliveryStatus: "sent",
    });

    render(
      <MemoryRouter>
        <InviteMembersPopup
          popupId="invite"
          workspaceId="1000000000000000100"
          core={coreMock as never}
          roles={roles}
          t={t}
          onClose={() => {}}
          onSent={async () => {}}
        />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(coreMock.getServerMailSettings).toHaveBeenCalled();
    });
    expect(screen.queryByTestId("invite-mail-inactive-banner")).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("web.workspaceSettings.members.invite.emailPlaceholder"), {
      target: { value: "a@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /web.workspaceSettings.members.invite.submit/ }));

    await waitFor(() => {
      expect(coreMock.createWorkspaceInvitations).toHaveBeenCalled();
    });
    expect((globalThis as { __lastInviteToast?: string }).__lastInviteToast).toBe(
      "web.workspaceSettings.members.invite.sent",
    );
  });
});
