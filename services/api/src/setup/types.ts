export type RegistrationMode = "open" | "invite_only";

export type ServerInstanceSettingsRow = {
  registrationMode: RegistrationMode;
  setupCompletedAt: string | null;
  /** Self-hosted instance workspace; null until first-run finish. */
  workspaceId: string | null;
  updatedAt: string;
};

/** Owner ids bound into the setup session for incomplete-setup resume (no Redis registration cache). */
export type SetupResumeOwnerIds = {
  userId: string;
  workspaceId: string;
  vaultId: string;
  deviceId: string;
};

export type SetupSessionPayload = {
  id: string;
  createdAt: string;
  /** Normalized owner email once begin-registration succeeded. */
  ownerEmail?: string;
  /** Present on the first-owner registration path (registration auth state id). */
  authStateId?: string;
  /**
   * Present only on incomplete-setup resume: same owner email, recovery already exported.
   * Finish completes setup without minting a session.
   */
  resumeOwner?: SetupResumeOwnerIds;
  mailSkipped?: boolean;
  registrationMode?: RegistrationMode;
};

export type SetupStatusResponse = {
  required: boolean;
  deploymentMode: "self_hosted" | "saas";
};

export type SetupVerifyResponse = {
  setupToken: string;
  expiresAt: string;
};

export type SetupBeginRegistrationInput = {
  email: string;
  firstName?: string;
  lastName?: string;
};

export type SetupBeginRegistrationResult = {
  /** Registration auth state id on the first-owner path; omitted for resume. */
  authStateId?: string;
  email: string;
  expiresAt: string;
  /**
   * True when the email already owns this incomplete self-host instance
   * (recovery exported). Client may skip password/recovery and call finish,
   * then must use the normal sign-in flow (no session from finish).
   */
  alreadyRegistered?: boolean;
};

export type SetupFinishInput = {
  workspaceName: string;
  tileColor?: string;
  invitations?: Array<{ email: string; roleBuiltinId?: "admin" | "user" }>;
  dismissPersonalDataBootstrap?: boolean;
};

export type SetupFinishResult = {
  /**
   * True for incomplete-setup resume: setup is complete but the client must
   * sign in normally (no access token issued).
   */
  signInRequired: boolean;
  accessToken: string | null;
  expiresAt: string | null;
  userId: string;
  workspaceId: string;
  vaultId: string;
  deviceId: string;
  tokenType: "Bearer" | null;
};

export interface ServerInstanceSettingsStore {
  read(): Promise<ServerInstanceSettingsRow>;
  writeRegistrationMode(mode: RegistrationMode): Promise<ServerInstanceSettingsRow>;
  markSetupCompleted(completedAt: string): Promise<ServerInstanceSettingsRow>;
  /**
   * Atomically set setup_completed_at (once) and the instance workspace pointer.
   * Used by first-run finish; idempotent when already completed.
   */
  markSetupCompletedWithWorkspace(
    completedAt: string,
    workspaceId: string,
  ): Promise<ServerInstanceSettingsRow>;
}
