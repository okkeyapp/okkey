import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  getTwoFactorStatus: vi.fn(),
  startTotpEnrollment: vi.fn(),
  confirmTotpEnrollment: vi.fn(),
  regenerateBackupCodes: vi.fn(),
  ackBackupCodesExport: vi.fn(),
  disableTwoFactor: vi.fn(),
}));

const coreMock = vi.hoisted(() => ({
  getHttpClient: () => ({}),
}));

vi.mock("@okkey/auth", () => ({
  AuthClient: class {
    getTwoFactorStatus = authMocks.getTwoFactorStatus;
    startTotpEnrollment = authMocks.startTotpEnrollment;
    confirmTotpEnrollment = authMocks.confirmTotpEnrollment;
    regenerateBackupCodes = authMocks.regenerateBackupCodes;
    ackBackupCodesExport = authMocks.ackBackupCodesExport;
    disableTwoFactor = authMocks.disableTwoFactor;
  },
}));

vi.mock("../../auth/AuthVaultContext", () => ({
  useAuthenticatedCoreClient: () => coreMock,
}));

vi.mock("../../locale/LocaleContext", () => ({
  useLocale: () => ({ locale: "ru", t: (key: string) => key }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), loading: vi.fn(() => "toast-id"), dismiss: vi.fn() },
}));

vi.mock("qrcode", () => ({
  default: {
    toDataURL: vi.fn(async () => "data:image/png;base64,aaa"),
  },
}));

import SettingsTwoFactorContent from "./SettingsTwoFactorContent";
import { clearSettingsPopupCache } from "./settingsPopupCache";

const t = (key: string, values?: Record<string, string | number>) => {
  if (!values) {
    return key;
  }
  return Object.entries(values).reduce(
    (message, [name, value]) => message.replace(`{${name}}`, String(value)),
    key,
  );
};

describe("SettingsTwoFactorContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearSettingsPopupCache();
    authMocks.getTwoFactorStatus.mockResolvedValue({
      enabled: false,
      backupCodesRemaining: 0,
      backupCodesGeneratedAt: null,
      backupCodesExportedAt: null,
    });
  });

  it("opens enroll popup when switch is turned on", async () => {
    authMocks.startTotpEnrollment.mockResolvedValue({
      enrollmentId: "enroll-1",
      secretBase32: "JBSWY3DPEHPK3PXP",
      otpauthUri: "otpauth://totp/Okkey:user?secret=JBSWY3DPEHPK3PXP",
      periodSeconds: 30,
      digits: 6,
      algorithm: "SHA1",
    });

    render(<SettingsTwoFactorContent t={t} />);

    const toggle = await screen.findByRole("switch", {
      name: "web.settingsPopup.twoFactor.authenticator.label",
    });
    await waitFor(() => {
      expect(toggle).not.toBeDisabled();
    });

    fireEvent.click(toggle);

    await waitFor(() => {
      expect(authMocks.startTotpEnrollment).toHaveBeenCalled();
    });
    expect(
      screen.getAllByText("web.settingsPopup.twoFactor.enroll.qrTitle").length,
    ).toBeGreaterThan(0);
    expect(toggle).toHaveAttribute("aria-checked", "false");
  });

  it("hides copy and pdf when enabled without session codes", async () => {
    authMocks.getTwoFactorStatus.mockResolvedValue({
      enabled: true,
      backupCodesRemaining: 8,
      backupCodesGeneratedAt: "2026-03-02T18:59:00.000Z",
      backupCodesExportedAt: null,
    });

    render(<SettingsTwoFactorContent t={t} />);

    expect(
      await screen.findByText("web.settingsPopup.twoFactor.backup.regenerate"),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(/web\.settingsPopup\.twoFactor\.backup\.lastGenerated/),
    ).toBeInTheDocument();
    expect(screen.queryByText("web.settingsPopup.twoFactor.backup.copy")).not.toBeInTheDocument();
    expect(
      screen.queryByText("web.settingsPopup.twoFactor.backup.downloadPdf"),
    ).not.toBeInTheDocument();
  });
});
