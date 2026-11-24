import type { CDPSession, Page } from "@playwright/test";

/**
 * Chromium virtual authenticator with PRF for passkey device-approval e2e.
 * Credentials stay inside the CDP authenticator for this browser context.
 */
export type VirtualPasskey = {
  authenticatorId: string;
  cdp: CDPSession;
};

export async function attachVirtualPasskey(page: Page): Promise<VirtualPasskey> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable", { enableUI: false });
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      // ctap2_1 is required for the PRF / hmac-secret path used by share wrap.
      ctap2Version: "ctap2_1",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      hasPrf: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  return { authenticatorId, cdp };
}

/** Same physical passkey across two browser contexts (credential export/import). */
export async function mirrorPasskeyCredentials(
  from: VirtualPasskey,
  to: VirtualPasskey,
): Promise<void> {
  const { credentials } = await from.cdp.send("WebAuthn.getCredentials", {
    authenticatorId: from.authenticatorId,
  });
  for (const credential of credentials) {
    await to.cdp.send("WebAuthn.addCredential", {
      authenticatorId: to.authenticatorId,
      credential,
    });
  }
}

export async function detachVirtualPasskey(passkey: VirtualPasskey): Promise<void> {
  try {
    await passkey.cdp.send("WebAuthn.removeVirtualAuthenticator", {
      authenticatorId: passkey.authenticatorId,
    });
  } catch {
    /* Context may already be closed. */
  }
  try {
    await passkey.cdp.detach();
  } catch {
    /* ignore */
  }
}
