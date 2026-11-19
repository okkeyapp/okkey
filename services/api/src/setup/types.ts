export type RegistrationMode = "open" | "invite_only";

export type ServerInstanceSettingsRow = {
  registrationMode: RegistrationMode;
  setupCompletedAt: string | null;
  updatedAt: string;
};

export type SetupSessionPayload = {
  id: string;
  createdAt: string;
  /** Normalized owner email once begin-registration succeeded. */
  ownerEmail?: string;
  authStateId?: string;
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
  authStateId: string;
  email: string;
  expiresAt: string;
};

export type SetupFinishInput = {
  workspaceName: string;
  tileColor?: string;
  invitations?: Array<{ email: string; roleBuiltinId?: "admin" | "user" }>;
  dismissPersonalDataBootstrap?: boolean;
};

export type SetupFinishResult = {
  accessToken: string;
  expiresAt: string;
  userId: string;
  workspaceId: string;
  vaultId: string;
  deviceId: string;
  tokenType: "Bearer";
};

export interface ServerInstanceSettingsStore {
  read(): Promise<ServerInstanceSettingsRow>;
  writeRegistrationMode(mode: RegistrationMode): Promise<ServerInstanceSettingsRow>;
  markSetupCompleted(completedAt: string): Promise<ServerInstanceSettingsRow>;
}
