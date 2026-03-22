import { ApiClient } from "../../api/src/index.js";
import type {
  EmailAuthConfirmResponse,
  EmailAuthStartResponse,
  RegisterCompleteRequestDto,
  RegisterCompleteResponseDto,
} from "../../types/src/index.js";

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
}
