import { fireEvent, render, screen } from "@testing-library/react";
import { MIN_MASTER_PASSWORD_LENGTH } from "@okkey/types";
import { describe, expect, it, vi } from "vitest";

import ChangeMasterPasswordPopup from "./ChangeMasterPasswordPopup";

const t = (key: string, values?: Record<string, string | number | boolean | Date | null | undefined>) => {
  if (values && "min" in values) {
    return `${key}:${String(values.min)}`;
  }
  return key;
};

describe("ChangeMasterPasswordPopup", () => {
  it("shows a validation message and blocks submit until the new password has 12 characters", () => {
    const onSubmit = vi.fn();
    render(
      <ChangeMasterPasswordPopup open t={t} onClose={() => {}} onSubmit={onSubmit} />,
    );

    fireEvent.change(screen.getByLabelText("web.settingsPopup.vault.changePassword.oldLabel"), {
      target: { value: "old-password" },
    });
    fireEvent.change(screen.getByLabelText("web.settingsPopup.vault.changePassword.newLabel"), {
      target: { value: "12345678901" },
    });
    fireEvent.change(screen.getByLabelText("web.settingsPopup.vault.changePassword.confirmLabel"), {
      target: { value: "12345678901" },
    });

    expect(
      screen.getByText(`web.settingsPopup.vault.changePassword.tooShort:${MIN_MASTER_PASSWORD_LENGTH}`),
    ).toBeTruthy();
    const submit = screen.getByRole("button", { name: "web.settingsPopup.vault.changePassword.submit" });
    expect(submit).toBeDisabled();
    fireEvent.click(submit);
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("web.settingsPopup.vault.changePassword.newLabel"), {
      target: { value: "123456789012" },
    });
    fireEvent.change(screen.getByLabelText("web.settingsPopup.vault.changePassword.confirmLabel"), {
      target: { value: "123456789012" },
    });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    expect(onSubmit).toHaveBeenCalledWith({
      oldPassword: "old-password",
      newPassword: "123456789012",
    });
  });
});
