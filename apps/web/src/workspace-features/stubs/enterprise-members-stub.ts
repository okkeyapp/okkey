import type { WorkspaceSettingsMembersModule } from "../registry";
import InviteUnavailablePage from "../../pages/invite/InviteUnavailablePage";

/** OSS stub: no additional members UI. */
const workspaceMembersModule: WorkspaceSettingsMembersModule = {
  AdditionalMembersSection: null,
  InviteLandingPage: InviteUnavailablePage,
};

export default workspaceMembersModule;

export function canCompletePendingVaultWraps(): boolean {
  return false;
}

export async function tryCompletePendingVaultWraps(): Promise<{ skippedInvalidKeys: number }> {
  return { skippedInvalidKeys: 0 };
}

