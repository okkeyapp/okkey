import type { Session, User } from "../../types/src/index.js";
import { ApiClient } from "../../api/src/index.js";

export interface AuthState {
  user: User | null;
  session: Session | null;
}

export class AuthClient {
  private api: ApiClient;

  constructor(api: ApiClient) {
    this.api = api;
  }

  async startEmailLogin(email: string): Promise<void> {
    await this.api.post<void>("/auth/email/start", { email });
  }

  async confirmEmailCode(email: string, code: string): Promise<Session> {
    return this.api.post<Session>("/auth/email/confirm", { email, code });
  }
}
