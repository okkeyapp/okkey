import type { ServerMailSettingsResponseDto, ServerMailSettingsUpdateRequestDto, SmtpTlsMode } from "@okkey/types";

import { createPublicApiClient } from "../api/client";

export type SetupStatusDto = {
  required: boolean;
  deployment_mode: "self_hosted" | "saas";
};

export type SetupSmtpProviderDto = {
  id: string;
  smtp_host: string;
  smtp_port: number;
  smtp_tls_mode: SmtpTlsMode;
  username_hint: string | null;
};

export type SetupVerifyDto = {
  setup_token: string;
  expires_at: string;
};

export type SetupInstanceDto = {
  public_app_url: string;
  registration_mode: "open" | "invite_only";
};

export type SetupBeginRegistrationDto = {
  auth_state_id: string;
  email: string;
  expires_at: string;
};

export type SetupFinishRequest = {
  workspace_name: string;
  tile_color?: string;
  invitations?: Array<{ email: string; role_builtin_id?: "admin" | "user" }>;
  dismiss_personal_data_bootstrap?: boolean;
};

export type SetupFinishDto = {
  access_token: string;
  expires_at: string;
  user_id: string;
  workspace_id: string;
  vault_id: string;
  device_id: string;
  token_type: "Bearer";
};

function setupHeaders(setupToken: string): Record<string, string> {
  return { "X-Setup-Token": setupToken };
}

/** Public first-run setup API (self-host empty catalog). */
export class SetupApiClient {
  private readonly api = createPublicApiClient();

  getStatus(): Promise<SetupStatusDto> {
    return this.api.get<SetupStatusDto>("/public/setup/status");
  }

  listSmtpProviders(): Promise<{ providers: SetupSmtpProviderDto[] }> {
    return this.api.get<{ providers: SetupSmtpProviderDto[] }>("/public/setup/smtp-providers");
  }

  verifyCode(code: string): Promise<SetupVerifyDto> {
    return this.api.post<SetupVerifyDto>("/public/setup/verify", { code });
  }

  getMailSettings(setupToken: string): Promise<ServerMailSettingsResponseDto> {
    return this.api.get<ServerMailSettingsResponseDto>("/public/setup/mail-settings", {
      headers: setupHeaders(setupToken),
    });
  }

  updateMailSettings(
    setupToken: string,
    body: ServerMailSettingsUpdateRequestDto,
  ): Promise<ServerMailSettingsResponseDto> {
    return this.api.patch<ServerMailSettingsResponseDto>("/public/setup/mail-settings", body, {
      headers: setupHeaders(setupToken),
    });
  }

  sendTestEmail(
    setupToken: string,
    body: ServerMailSettingsUpdateRequestDto & { recipient_email: string },
  ): Promise<ServerMailSettingsResponseDto> {
    return this.api.post<ServerMailSettingsResponseDto>(
      "/public/setup/mail-settings/test-email",
      body,
      { headers: setupHeaders(setupToken) },
    );
  }

  skipMail(setupToken: string): Promise<ServerMailSettingsResponseDto> {
    return this.api.post<ServerMailSettingsResponseDto>(
      "/public/setup/mail-settings/skip",
      {},
      { headers: setupHeaders(setupToken) },
    );
  }

  getInstance(setupToken: string): Promise<SetupInstanceDto> {
    return this.api.get<SetupInstanceDto>("/public/setup/instance", {
      headers: setupHeaders(setupToken),
    });
  }

  updateInstance(
    setupToken: string,
    body: { public_app_url?: string; registration_mode?: "open" | "invite_only" },
  ): Promise<SetupInstanceDto> {
    return this.api.patch<SetupInstanceDto>("/public/setup/instance", body, {
      headers: setupHeaders(setupToken),
    });
  }

  beginRegistration(setupToken: string, email: string): Promise<SetupBeginRegistrationDto> {
    return this.api.post<SetupBeginRegistrationDto>(
      "/public/setup/begin-registration",
      { email },
      { headers: setupHeaders(setupToken) },
    );
  }

  finish(setupToken: string, body: SetupFinishRequest): Promise<SetupFinishDto> {
    return this.api.post<SetupFinishDto>("/public/setup/finish", body, {
      headers: setupHeaders(setupToken),
    });
  }
}

export function createSetupApiClient(): SetupApiClient {
  return new SetupApiClient();
}
