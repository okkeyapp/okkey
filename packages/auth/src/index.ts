import { ApiClient } from "../../api/src/index.js";
import type {
  AccessTokenResponseDto,
  AccountLoginMethodsPrimaryPatchDto,
  AccountLoginMethodsResponseDto,
  AuthLoginDiscoverRequestDto,
  AuthLoginDiscoverResponseDto,
  BackupCodesPlaintextResponseDto,
  BackupCodesRegenerateRequestDto,
  EmailAuthConfirmResponse,
  EmailAuthStartResponse,
  ExtensionAuthCodeIssueRequestDto,
  ExtensionAuthCodeIssueResponseDto,
  ExtensionAuthTokenRequestDto,
  RegisterCompleteRequestDto,
  RegisterCompleteResponseDto,
  TotpEnrollConfirmRequestDto,
  TotpEnrollStartResponseDto,
  TwoFactorDisableRequestDto,
  TwoFactorStatusResponseDto,
  WebAuthnCeremonyOptionsResponseDto,
  WebAuthnLoginOptionsRequestDto,
  WebAuthnLoginVerifyRequestDto,
  WebAuthnLoginVerifyResponseDto,
  WebAuthnRegisterOptionsRequestDto,
  WebAuthnRegisterVerifyRequestDto,
  WebAuthnAuthenticatorAttachment,
} from "../../types/src/index.js";

export class LoginFlowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LoginFlowError";
  }
}

export class AuthClient {
  private api: ApiClient;

  constructor(api: ApiClient) {
    this.api = api;
  }

  async startEmailLogin(email: string, locale?: string): Promise<EmailAuthStartResponse> {
    return this.api.post<EmailAuthStartResponse>("/auth/email/start", {
      email,
      ...(locale !== undefined ? { locale } : {}),
    });
  }

  async resendEmailCode(challengeId: string, locale?: string): Promise<EmailAuthStartResponse> {
    return this.api.post<EmailAuthStartResponse>("/auth/email/resend", {
      challengeId,
      ...(locale !== undefined ? { locale } : {}),
    });
  }

  async confirmEmailCode(
    challengeId: string,
    code: string,
  ): Promise<EmailAuthConfirmResponse> {
    return this.api.post<EmailAuthConfirmResponse>("/auth/email/confirm", {
      challengeId,
      code,
    });
  }

  async completeRegistration(
    body: RegisterCompleteRequestDto,
  ): Promise<RegisterCompleteResponseDto> {
    return this.api.post<RegisterCompleteResponseDto>("/auth/register/complete", body);
  }

  async bootstrapSession(authStateId: string): Promise<AccessTokenResponseDto> {
    return this.api.post<AccessTokenResponseDto>("/auth/session/bootstrap", {
      authStateId,
    });
  }

  /**
   * After web Bearer session: mint a short-lived auth_code for extension PKCE.
   * Does not unlock vault — session handoff only.
   */
  async issueExtensionAuthCode(
    body: ExtensionAuthCodeIssueRequestDto,
  ): Promise<ExtensionAuthCodeIssueResponseDto> {
    return this.api.post<ExtensionAuthCodeIssueResponseDto>("/auth/extension/code", body);
  }

  /** Exchange extension auth_code + PKCE verifier for a Bearer access token. */
  async exchangeExtensionAuthToken(
    body: ExtensionAuthTokenRequestDto,
  ): Promise<AccessTokenResponseDto> {
    return this.api.post<AccessTokenResponseDto>("/auth/extension/token", body);
  }

  async verifyTwoFactor(authStateId: string, code: string): Promise<AccessTokenResponseDto> {
    return this.api.post<AccessTokenResponseDto>("/auth/two-factor/verify", {
      authStateId,
      code,
    });
  }

  async getTwoFactorStatus(): Promise<TwoFactorStatusResponseDto> {
    return this.api.get<TwoFactorStatusResponseDto>("/auth/two-factor/status");
  }

  async ackBackupCodesExport(): Promise<TwoFactorStatusResponseDto> {
    return this.api.post<TwoFactorStatusResponseDto>(
      "/auth/two-factor/backup-codes/ack-export",
      {},
    );
  }

  async startTotpEnrollment(): Promise<TotpEnrollStartResponseDto> {
    return this.api.post<TotpEnrollStartResponseDto>(
      "/auth/two-factor/totp/enroll/start",
      {},
    );
  }

  async confirmTotpEnrollment(
    body: TotpEnrollConfirmRequestDto,
  ): Promise<BackupCodesPlaintextResponseDto> {
    return this.api.post<BackupCodesPlaintextResponseDto>(
      "/auth/two-factor/totp/enroll/confirm",
      body,
    );
  }

  async regenerateBackupCodes(
    body: BackupCodesRegenerateRequestDto,
  ): Promise<BackupCodesPlaintextResponseDto> {
    return this.api.post<BackupCodesPlaintextResponseDto>(
      "/auth/two-factor/backup-codes/regenerate",
      body,
    );
  }

  async disableTwoFactor(body: TwoFactorDisableRequestDto): Promise<{ disabled: true }> {
    return this.api.post<{ disabled: true }>("/auth/two-factor/disable", body);
  }

  async discoverLoginMethods(
    body: AuthLoginDiscoverRequestDto,
  ): Promise<AuthLoginDiscoverResponseDto> {
    return this.api.post<AuthLoginDiscoverResponseDto>("/auth/login/discover", body);
  }

  async webauthnLoginOptions(
    body: WebAuthnLoginOptionsRequestDto = {},
  ): Promise<WebAuthnCeremonyOptionsResponseDto> {
    return this.api.post<WebAuthnCeremonyOptionsResponseDto>(
      "/auth/webauthn/login/options",
      body,
    );
  }

  async webauthnLoginVerify(
    body: WebAuthnLoginVerifyRequestDto,
  ): Promise<WebAuthnLoginVerifyResponseDto> {
    return this.api.post<WebAuthnLoginVerifyResponseDto>("/auth/webauthn/login/verify", body);
  }

  async getLoginMethods(): Promise<AccountLoginMethodsResponseDto> {
    return this.api.get<AccountLoginMethodsResponseDto>("/account/login-methods");
  }

  async setPrimaryLoginMethod(
    body: AccountLoginMethodsPrimaryPatchDto,
  ): Promise<AccountLoginMethodsResponseDto> {
    return this.api.patch<AccountLoginMethodsResponseDto>(
      "/account/login-methods/primary",
      body,
    );
  }

  async webauthnRegisterOptions(
    body: WebAuthnRegisterOptionsRequestDto,
  ): Promise<WebAuthnCeremonyOptionsResponseDto> {
    return this.api.post<WebAuthnCeremonyOptionsResponseDto>(
      "/account/webauthn/register/options",
      body,
    );
  }

  async webauthnRegisterVerify(
    body: WebAuthnRegisterVerifyRequestDto,
  ): Promise<AccountLoginMethodsResponseDto> {
    return this.api.post<AccountLoginMethodsResponseDto>(
      "/account/webauthn/register/verify",
      body,
    );
  }

  async deleteWebauthnCredential(credentialId: string): Promise<AccountLoginMethodsResponseDto> {
    return this.api.delete<AccountLoginMethodsResponseDto>(
      `/account/webauthn/credentials/${encodeURIComponent(credentialId)}`,
    );
  }

  async deleteWebauthnCredentialsByAttachment(
    attachment: WebAuthnAuthenticatorAttachment,
  ): Promise<AccountLoginMethodsResponseDto> {
    const q = new URLSearchParams({ attachment });
    return this.api.delete<AccountLoginMethodsResponseDto>(
      `/account/webauthn/credentials?${q.toString()}`,
    );
  }

  /**
   * After `confirmEmailCode`, call the session endpoint matching `nextStep`:
   * `device_check` → bootstrap, `two_factor` → verify (requires `twoFactorCode`).
   * `registration` is not handled here — use `completeRegistration` instead.
   */
  async completeLoginAfterEmailConfirm(
    authStateId: string,
    nextStep: EmailAuthConfirmResponse["nextStep"],
    twoFactorCode?: string,
  ): Promise<AccessTokenResponseDto> {
    if (nextStep === "registration") {
      throw new LoginFlowError(
        "nextStep is registration: build RegisterCompleteRequestDto and call completeRegistration",
      );
    }
    if (nextStep === "two_factor") {
      if (twoFactorCode === undefined || twoFactorCode.trim() === "") {
        throw new LoginFlowError("twoFactorCode is required when nextStep is two_factor");
      }
      return this.verifyTwoFactor(authStateId, twoFactorCode.trim());
    }
    return this.bootstrapSession(authStateId);
  }
}
