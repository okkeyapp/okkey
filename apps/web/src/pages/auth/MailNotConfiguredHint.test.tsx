import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import en from "../../../../../packages/i18n/src/locales/web/en.json";
import ru from "../../../../../packages/i18n/src/locales/web/ru.json";
import { LocaleProvider } from "../../locale/LocaleContext";
import { MailNotConfiguredHint } from "./MailNotConfiguredHint";

function renderHint(emailDeliverable: boolean | null | undefined) {
  return render(
    <LocaleProvider>
      <MailNotConfiguredHint emailDeliverable={emailDeliverable} />
    </LocaleProvider>,
  );
}

describe("MailNotConfiguredHint", () => {
  it("shows the worker log command when mail is not deliverable", () => {
    renderHint(false);
    expect(
      screen.getByText(
        "Mail is not configured on this server. The confirmation code is in the worker logs. Run:",
      ),
    ).toBeTruthy();
    expect(screen.getByText("docker compose logs worker")).toBeTruthy();
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
    }
    expect(ru["auth.otp.mailNotConfiguredHint"]).toContain("worker");
  });
});
