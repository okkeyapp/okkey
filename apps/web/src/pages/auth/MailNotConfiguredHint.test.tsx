import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import en from "../../../../../packages/i18n/src/locales/web/en.json";
import ru from "../../../../../packages/i18n/src/locales/web/ru.json";
import { LocaleProvider } from "../../locale/LocaleContext";
import { AUTH_MASTER_PASSWORD_PATH } from "../../routes/paths";
import { MailNotConfiguredHint } from "./MailNotConfiguredHint";

function renderHint(emailDeliverable: boolean | null | undefined) {
  return render(
    <MemoryRouter>
      <LocaleProvider>
        <MailNotConfiguredHint emailDeliverable={emailDeliverable} />
      </LocaleProvider>
    </MemoryRouter>,
  );
}

describe("MailNotConfiguredHint", () => {
  it("shows the worker log command when mail is not deliverable", () => {
    renderHint(false);
    expect(
      screen.getByText(
        "Mail is not configured on this server. The confirmation code is in the worker logs.",
      ),
    ).toBeTruthy();
    expect(screen.getByText(/Run:/)).toBeTruthy();
    const command = screen.getByText("docker compose logs worker");
    expect(command).toBeTruthy();
    expect(command.tagName).toBe("CODE");
    expect(command.className).toContain("bg-primary");
    expect(command.className).toContain("rounded-[4px]");
  });

  it("links to master password sign-in", () => {
    renderHint(false);
    const link = screen.getByRole("link", { name: "sign in with your master password" });
    expect(link.getAttribute("href")).toBe(AUTH_MASTER_PASSWORD_PATH);
  });

  it("hides the hint when mail is deliverable", () => {
    renderHint(true);
    expect(screen.queryByText("docker compose logs worker")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("hides the hint when the server omits the flag", () => {
    renderHint(undefined);
    renderHint(null);
    expect(screen.queryByText("docker compose logs worker")).toBeNull();
  });

  it("keeps the worker command in every locale", () => {
    for (const bundle of [en, ru]) {
      expect(bundle["auth.otp.mailNotConfiguredHint"].length).toBeGreaterThan(0);
      expect(bundle["auth.otp.mailNotConfiguredCommand"]).toBe("docker compose logs worker");
      expect(bundle["auth.otp.mailNotConfiguredOrMasterLink"].length).toBeGreaterThan(0);
    }
    expect(ru["auth.otp.mailNotConfiguredHint"]).toContain("worker");
    expect(ru["auth.otp.mailNotConfiguredOrMasterLink"]).toContain("мастер-паролем");
  });
});
