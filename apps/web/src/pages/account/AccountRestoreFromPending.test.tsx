import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import App from "../../App";
import { parseBrowserEnvironment } from "../../auth/browserEnvironment";
import type { DeviceTrustSnapshot } from "../../auth/deviceTrust";
import { PROFILE_STORAGE_KEY, SESSION_STORAGE_KEY } from "../../auth/storageKeys";
import { ACCOUNT_DEVICE_PENDING_PATH } from "../../routes/paths";

const trustOverride: {
  resolve: (() => Promise<DeviceTrustSnapshot>) | null;
  poll: (() => Promise<DeviceTrustSnapshot>) | null;
} = { resolve: null, poll: null };

vi.mock("../../auth/deviceTrust", async () => {
  const actual = await vi.importActual<typeof import("../../auth/deviceTrust")>("../../auth/deviceTrust");
  return {
    ...actual,
    resolveDeviceTrust: (...args: Parameters<typeof actual.resolveDeviceTrust>) =>
      trustOverride.resolve ? trustOverride.resolve() : actual.resolveDeviceTrust(...args),
    pollDeviceTrust: (...args: Parameters<typeof actual.pollDeviceTrust>) =>
      trustOverride.poll ? trustOverride.poll() : actual.pollDeviceTrust(...args),
  };
});

const fingerprint = parseBrowserEnvironment(
  typeof navigator !== "undefined" ? navigator.userAgent : "",
).fingerprint;

function seedSession() {
  const payload = JSON.stringify({
    access_token: "pending-session-token",
    user_id: "1156820912149601",
    expires_at: new Date(Date.now() + 3_600_000).toISOString(),
  });
  if (typeof localStorage?.setItem === "function") {
    localStorage.setItem(SESSION_STORAGE_KEY, payload);
  } else {
    sessionStorage.setItem(SESSION_STORAGE_KEY, payload);
  }
  sessionStorage.setItem(
    PROFILE_STORAGE_KEY,
    JSON.stringify({
      email: "user@okkey.local",
      firstName: "Test",
      lastName: "User",
    }),
  );
}

function recoveryStatusBody() {
  return {
    entitlements: { recoveryKey: true, trustedDevices: false, trustedContacts: false },
    settings: { keyEnabled: true, devicesEnabled: false, contactsEnabled: false },
    key: {
      enrolled: true,
      createdAt: "2026-03-02T21:59:00.000Z",
      rotatedAt: null,
      exportedAt: "2026-03-02T22:00:00.000Z",
    },
    contacts: [],
    confirmedContactCount: 0,
    minConfirmedContacts: 3,
    pendingInvites: [],
    servingAsContact: [],
  };
}

function deviceRow() {
  return {
    device_id: "101",
    device_fingerprint: fingerprint,
    device_name: "Chrome",
    platform: "desktop",
    os_name: "macOS",
    os_version: "14.5",
    app_version: "web",
    client_type: "web_app",
    user_agent: navigator.userAgent,
    status: "trusted",
    created_at: "2026-01-01T00:00:00.000Z",
    last_seen_at: "2026-01-01T00:00:00.000Z",
    approved_at: "2026-01-01T00:00:00.000Z",
    is_current: true,
    approval_expires_at: null,
    blocked_until: null,
    ip_address: null,
    country: null,
    city: null,
  };
}

describe("restore from a device that is not approved", () => {
  const calls: string[] = [];

  beforeEach(() => {
    trustOverride.resolve = null;
    trustOverride.poll = null;
    calls.length = 0;
    if (typeof localStorage?.removeItem === "function") {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    }
    sessionStorage.clear();
    seedSession();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        calls.push(`${method} ${url}`);
        if (url.includes("/devices")) {
          return new Response(
            JSON.stringify({ devices: [deviceRow()], pending: [], blocked: [] }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (url.includes("/account/recovery") && !url.includes("/key/")) {
          return new Response(JSON.stringify(recoveryStatusBody()), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(
          JSON.stringify({ error: "AUTH_REQUIRED", message: "auth required", requestId: "t" }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        );
      }),
    );
  });

  it("opens the recovery key field from the device-pending restore action", async () => {
    render(
      <MemoryRouter initialEntries={[ACCOUNT_DEVICE_PENDING_PATH]}>
        <App />
      </MemoryRouter>,
    );

    const restore = await screen.findByRole("link", { name: /restore with recovery key/i });
    fireEvent.click(restore);

    await waitFor(() => {
      expect(screen.getByLabelText(/^recovery key$/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/could not load recovery methods/i)).not.toBeInTheDocument();
    expect(calls.some((call) => call.includes("/account/recovery") && !call.includes("/key/"))).toBe(
      true,
    );
  });

  it("opens the recovery key field from a device that is still waiting for approval", async () => {
    const pending: DeviceTrustSnapshot = {
      status: "pending",
      deviceId: "d-new",
      approverDevices: [],
    };
    trustOverride.resolve = async () => pending;
    trustOverride.poll = async () => pending;

    render(
      <MemoryRouter initialEntries={[ACCOUNT_DEVICE_PENDING_PATH]}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: /confirm this device/i })).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("link", { name: /restore with recovery key/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/^recovery key$/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/could not load recovery methods/i)).not.toBeInTheDocument();
  });
});
