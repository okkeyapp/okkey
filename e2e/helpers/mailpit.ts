import { E2E_MAILPIT_URL } from "./env";

type MailpitMessageSummary = {
  ID: string;
  To?: Array<{ Address?: string }>;
  Subject?: string;
  Created?: string;
};

type MailpitListResponse = {
  messages?: MailpitMessageSummary[];
};

type MailpitMessage = {
  ID: string;
  Text?: string;
  HTML?: string;
  Subject?: string;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function extractSixDigitCode(body: string): string | null {
  // Prefer an isolated 6-digit token (OTP), not longer numbers.
  const match = body.match(/(?<!\d)(\d{6})(?!\d)/);
  return match?.[1] ?? null;
}

/**
 * Read the latest auth OTP for `email` from Mailpit HTTP API.
 * Browser e2e must not inject fixed codes into the API `createCode()` path.
 */
export async function waitForMailpitOtp(
  email: string,
  options?: { timeoutMs?: number; sinceMs?: number },
): Promise<string> {
  const timeoutMs = options?.timeoutMs ?? 30_000;
  const sinceMs = options?.sinceMs ?? Date.now() - 5_000;
  const want = normalizeEmail(email);
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const listRes = await fetch(`${E2E_MAILPIT_URL}/api/v1/messages`);
    if (!listRes.ok) {
      throw new Error(`mailpit list failed: HTTP ${listRes.status}`);
    }
    const list = (await listRes.json()) as MailpitListResponse;
    const candidates = (list.messages ?? []).filter((msg) => {
      const to = (msg.To ?? []).map((t) => normalizeEmail(t.Address ?? ""));
      if (!to.includes(want)) {
        return false;
      }
      if (msg.Created) {
        const created = Date.parse(msg.Created);
        if (Number.isFinite(created) && created + 1000 < sinceMs) {
          return false;
        }
      }
      return true;
    });

    for (const summary of candidates) {
      const msgRes = await fetch(`${E2E_MAILPIT_URL}/api/v1/message/${summary.ID}`);
      if (!msgRes.ok) {
        continue;
      }
      const msg = (await msgRes.json()) as MailpitMessage;
      const body = `${msg.Text ?? ""}\n${msg.HTML ?? ""}`;
      const code = extractSixDigitCode(body);
      if (code) {
        return code;
      }
    }

    await new Promise((r) => setTimeout(r, 400));
  }

  throw new Error(`mailpit: no OTP for ${email} within ${timeoutMs}ms (base ${E2E_MAILPIT_URL})`);
}
