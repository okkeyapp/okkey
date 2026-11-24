import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LOCALE_STORAGE_KEY } from "../../locale/localeStorage";
import { LocaleProvider } from "../../locale/LocaleContext";
import DevicePendingPage from "./DevicePendingPage";

const auth = vi.hoisted(() => ({
  accessToken: "tok" as string | null,
  userId: "user-1" as string | null,
  deviceApprovalWatch: false,
  deviceTrustStatus: "pending" as
    | "idle"
    | "checking"
    | "trusted"
    | "pending"
    | "blocked"
    | "rejected"
    | "error",
  deviceBlockedUntil: null as string | null,
  deviceApprovers: [] as Array<Record<string, string>>,
  deviceNeedsRecovery: false,
  deviceShareReapproval: false,
  refreshDeviceTrust: vi.fn(async () => undefined),
  retryDeviceRegistration: vi.fn(async () => undefined),
  currentDeviceId: "device-1" as string | null,
  profile: { email: "user@okkey.local", firstName: "Test", lastName: "User" },
  logout: vi.fn(),
}));

const coreClient = vi.hoisted(() => ({
  current: {} as Record<string, never> | null,
}));

const passkey = vi.hoisted(() => ({
  approvePendingDeviceWithPasskey: vi.fn(
    async (): Promise<{ ok: true } | { ok: false; code: "prf_unavailable" | "cancelled" }> => ({
      ok: true,
    }),
  ),
}));

const toastMocks = vi.hoisted(() => ({
  error: vi.fn(),
  message: vi.fn(),
  success: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: toastMocks,
}));

vi.mock("../../auth/passkeyDeviceApproval", () => ({
  approvePendingDeviceWithPasskey: passkey.approvePendingDeviceWithPasskey,
  passkeyApprovalErrorMessageKey: (code: string) => `web.devicePending.passkey.${code}`,
}));

vi.mock("../../auth/AuthVaultContext", () => ({
  useAuthVault: () => auth,
  useAuthenticatedCoreClient: () => coreClient.current as never,
}));

function ensureLocalStorage(): void {
  if (typeof localStorage?.getItem === "function" && typeof localStorage?.setItem === "function") {
    return;
  }
  const data = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
    clear: () => {
      data.clear();
    },
    key: (index: number) => [...data.keys()][index] ?? null,
    get length() {
      return data.size;
    },
  });
}

function renderPage() {
  return render(
    <LocaleProvider>
      <MemoryRouter>
        <DevicePendingPage />
      </MemoryRouter>
    </LocaleProvider>,
  );
}

describe("DevicePendingPage copy", () => {
  beforeEach(() => {
    ensureLocalStorage();
    auth.accessToken = "tok";
    auth.userId = "user-1";
    auth.deviceApprovalWatch = false;
    auth.deviceTrustStatus = "pending";
    auth.deviceBlockedUntil = null;
    auth.deviceApprovers = [];
    auth.deviceNeedsRecovery = false;
    auth.deviceShareReapproval = false;
    auth.refreshDeviceTrust.mockClear();
    auth.retryDeviceRegistration.mockClear();
    auth.currentDeviceId = "device-1";
    coreClient.current = {};
    passkey.approvePendingDeviceWithPasskey.mockReset();
    passkey.approvePendingDeviceWithPasskey.mockResolvedValue({ ok: true });
    toastMocks.error.mockClear();
    toastMocks.message.mockClear();
    localStorage.setItem(LOCALE_STORAGE_KEY, "en");
  });

  it("shows the waiting heading in English while approval is pending", () => {
    renderPage();

    expect(screen.getByRole("heading", { name: "Confirm this device" })).toBeInTheDocument();
    expect(screen.getByText(/waiting for approval/i)).toBeInTheDocument();
    expect(screen.getByText(/approve this sign-in from one of your trusted devices/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /restore with recovery key/i })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "This device was denied" })).not.toBeInTheDocument();
    expect(screen.queryByText(/a trusted device rejected this sign-in/i)).not.toBeInTheDocument();
  });

  it("shows the waiting heading in Russian while approval is pending", () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, "ru");
    renderPage();

    expect(screen.getByRole("heading", { name: "Подтвердите это устройство" })).toBeInTheDocument();
    expect(screen.getByText(/ожидаем подтверждения/i)).toBeInTheDocument();
    expect(screen.getByText(/подтвердите вход с одного из доверенных устройств/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Вход отклонён" })).not.toBeInTheDocument();
  });

  it("shows the denied heading in English only after the device was rejected", () => {
    auth.deviceTrustStatus = "rejected";
    renderPage();

    expect(screen.getByRole("heading", { name: "This device was denied" })).toBeInTheDocument();
    expect(screen.getByText(/a trusted device rejected this sign-in/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /request approval again/i })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Confirm this device" })).not.toBeInTheDocument();
    expect(screen.queryByText(/waiting for approval/i)).not.toBeInTheDocument();
  });

  it("shows the denied heading in Russian only after the device was rejected", () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, "ru");
    auth.deviceTrustStatus = "rejected";
    renderPage();

    expect(screen.getByRole("heading", { name: "Вход отклонён" })).toBeInTheDocument();
    expect(screen.getByText(/доверенное устройство отклонило этот вход/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /запросить подтверждение снова/i })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Подтвердите это устройство" })).not.toBeInTheDocument();
  });

  it("does not use the denied heading when trust lookup fails while recovery is still offered", () => {
    auth.deviceTrustStatus = "error";
    auth.deviceNeedsRecovery = true;
    renderPage();

    expect(screen.getByRole("heading", { name: "Confirm this device" })).toBeInTheDocument();
    expect(screen.getByText(/waiting for approval/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /restore with recovery key/i })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "This device was denied" })).not.toBeInTheDocument();
    expect(screen.queryByText(/a trusted device rejected this sign-in/i)).not.toBeInTheDocument();
  });

  it("shows the denied page from the approval-status credential without a session", () => {
    auth.accessToken = null;
    auth.deviceApprovalWatch = true;
    auth.deviceTrustStatus = "rejected";
    renderPage();

    expect(screen.getByRole("heading", { name: "This device was denied" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /request approval again/i })).toBeInTheDocument();
  });

  it("shows the blocked page from the approval-status credential without a session", () => {
    auth.accessToken = null;
    auth.deviceApprovalWatch = true;
    auth.deviceTrustStatus = "blocked";
    auth.deviceBlockedUntil = null;
    renderPage();

    expect(screen.getByRole("heading", { name: "This device is blocked" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /request approval again/i })).not.toBeInTheDocument();
  });

  it("shows the passkey button and a toast when PRF is missing", async () => {
    passkey.approvePendingDeviceWithPasskey.mockResolvedValue({
      ok: false,
      code: "prf_unavailable",
    });
    renderPage();
    auth.refreshDeviceTrust.mockClear();
    toastMocks.error.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "Approve with passkey" }));

    await vi.waitFor(() => {
      expect(toastMocks.error).toHaveBeenCalled();
    });
    expect(String(toastMocks.error.mock.calls[0]?.[0])).toMatch(/did not copy a device share/i);
    expect(auth.refreshDeviceTrust).not.toHaveBeenCalled();
    expect(screen.queryByText(/did not copy a device share/i)).toBeNull();
  });

  it("toasts a cancel and allows Approve with passkey again", async () => {
    passkey.approvePendingDeviceWithPasskey
      .mockResolvedValueOnce({ ok: false, code: "cancelled" })
      .mockResolvedValueOnce({ ok: true });
    renderPage();
    toastMocks.message.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "Approve with passkey" }));
    await vi.waitFor(() => {
      expect(toastMocks.message).toHaveBeenCalled();
    });
    expect(String(toastMocks.message.mock.calls[0]?.[0])).toMatch(/cancelled/i);
    expect(screen.queryByText(/Passkey confirmation was cancelled/i)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Approve with passkey" }));
    await vi.waitFor(() => {
      expect(passkey.approvePendingDeviceWithPasskey).toHaveBeenCalledTimes(2);
    });
  });

  it("toasts when Approve with passkey is pressed without a session", async () => {
    auth.accessToken = null;
    auth.deviceApprovalWatch = true;
    coreClient.current = null;
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Approve with passkey" }));

    await vi.waitFor(() => {
      expect(toastMocks.error).toHaveBeenCalled();
    });
    expect(String(toastMocks.error.mock.calls[0]?.[0])).toMatch(/sign in again/i);
    expect(passkey.approvePendingDeviceWithPasskey).not.toHaveBeenCalled();
  });

  it("passes userId into passkey approve so the hybrid can be persisted", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Approve with passkey" }));
    await vi.waitFor(() => {
      expect(passkey.approvePendingDeviceWithPasskey).toHaveBeenCalledWith(
        expect.anything(),
        "device-1",
        expect.objectContaining({ userId: "user-1" }),
      );
    });
  });

  it("refreshes device trust after Try again so approvers are not stale", async () => {
    auth.deviceTrustStatus = "rejected";
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /request approval again/i }));
    await vi.waitFor(() => {
      expect(auth.retryDeviceRegistration).toHaveBeenCalledTimes(1);
    });
    await vi.waitFor(() => {
      expect(auth.refreshDeviceTrust).toHaveBeenCalled();
    });
  });
});
