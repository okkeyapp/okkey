import type { Workspace } from "@okkey/types";

/** Banner shown until a member receives the current workspace key. */
export const WORKSPACE_KEY_PENDING_BANNER = "Workspace key has not been shared yet";

/** Card flags used until workspace client settings can be read. */
export const DEFAULT_WORKSPACE_MONITORING_CARDS = {
  overall: true,
  strength: true,
  reused: true,
  weak: true,
  compromised: true,
  stale: true,
  passkeyGap: true,
  twoFactorGap: true,
} as const;

export type WorkspaceMonitoringCards = { [Key in keyof typeof DEFAULT_WORKSPACE_MONITORING_CARDS]: boolean };

export type WorkspaceMemberAppearance = {
  tileColor: string | null;
  logoKeyVersion: number | null;
  logoVaultId: string | null;
  logoAttachmentId: string | null;
  monitoringCards: WorkspaceMonitoringCards;
  banner: string | null;
};

type AppearanceWorkspace = Pick<
  Workspace,
  "tileColor" | "logoKeyVersion" | "logoVaultId" | "logoAttachmentId"
>;

/**
 * Appearance for one member.
 * Before that member holds the current workspace key, the shell uses the default logo tile,
 * an empty tile colour, and the default monitoring cards, and does not decrypt workspace data.
 */
export function workspaceAppearanceForMember(input: {
  access: "open" | "pending" | "unknown";
  workspace: AppearanceWorkspace | null | undefined;
}): WorkspaceMemberAppearance {
  const monitoringCards = { ...DEFAULT_WORKSPACE_MONITORING_CARDS };
  if (input.access !== "open" || !input.workspace) {
    return {
      tileColor: null,
      logoKeyVersion: null,
      logoVaultId: null,
      logoAttachmentId: null,
      monitoringCards,
      banner: input.access === "pending" ? WORKSPACE_KEY_PENDING_BANNER : null,
    };
  }
  return {
    tileColor: input.workspace.tileColor ?? null,
    logoKeyVersion: input.workspace.logoKeyVersion ?? null,
    logoVaultId: input.workspace.logoVaultId ?? null,
    logoAttachmentId: input.workspace.logoAttachmentId ?? null,
    monitoringCards,
    banner: null,
  };
}

export function workspaceWithMemberAppearance(
  workspace: Workspace,
  access: "open" | "pending" | "unknown",
): Workspace {
  const appearance = workspaceAppearanceForMember({ access, workspace });
  if (access === "open") {
    return workspace;
  }
  return {
    ...workspace,
    tileColor: appearance.tileColor,
    logoKeyVersion: appearance.logoKeyVersion,
    logoVaultId: appearance.logoVaultId,
    logoAttachmentId: appearance.logoAttachmentId,
  };
}
