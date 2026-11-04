import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LOCALE_STORAGE_KEY } from "../../locale/localeStorage";
import { LocaleProvider } from "../../locale/LocaleContext";
import DevicePendingPage from "./DevicePendingPage";

const auth = vi.hoisted(() => ({
  accessToken: "tok" as string | null,
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
  refreshDeviceTrust: vi.fn(async () => undefined),
  retryDeviceRegistration: vi.fn(async () => undefined),
  profile: { email: "user@okkey.local", firstName: "Test", lastName: "User" },
  logout: vi.fn(),
}));

vi.mock("../../auth/AuthVaultContext", () => ({
  useAuthVault: () => auth,
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
    auth.deviceTrustStatus = "pending";
    auth.deviceBlockedUntil = null;
    auth.deviceApprovers = [];
    auth.deviceNeedsRecovery = false;
    auth.refreshDeviceTrust.mockClear();
    auth.retryDeviceRegistration.mockClear();
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
});
