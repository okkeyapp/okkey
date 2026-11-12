import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import SelfHostedSalesRequestPopup from "./SelfHostedSalesRequestPopup";

const t = (key: string) => key;

function renderPopup() {
  const onSubmit = vi.fn();
  render(
    <SelfHostedSalesRequestPopup
      open
      initialLocale="en"
      initialRegion="US"
      initialEmail=""
      senderEmail="owner@example.com"
      workspaceName="Demo"
      workspaceUrl="https://vault.example"
      t={t}
      onClose={() => {}}
      onSubmit={onSubmit}
    />,
  );
  return { onSubmit };
}

describe("SelfHostedSalesRequestPopup", () => {
  it("keeps Send disabled until the reply email is a usable address", () => {
    const { onSubmit } = renderPopup();
    const email = screen.getByLabelText("web.workspaceSettings.plan.request.emailLabel");
    const members = screen.getByLabelText("web.workspaceSettings.plan.request.memberCountLabel");
    const submit = screen.getByRole("button", {
      name: "web.workspaceSettings.plan.selfHosted.requestSubmit",
    });

    fireEvent.change(members, { target: { value: "3" } });
    expect(submit).toBeDisabled();

    for (const value of ["a@", "@b", "x@y"]) {
      fireEvent.change(email, { target: { value } });
      expect(submit).toBeDisabled();
      fireEvent.click(submit);
      expect(onSubmit).not.toHaveBeenCalled();
    }

    fireEvent.change(email, { target: { value: "reply@example.com" } });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    expect(onSubmit).toHaveBeenCalledWith({
      contactEmail: "reply@example.com",
      locale: "en",
      region: "US",
      workspaceMemberCount: 3,
    });
  });
});
