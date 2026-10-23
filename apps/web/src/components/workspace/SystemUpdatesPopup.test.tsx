import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { UpdateCheckInfo } from "../../workspace/useUpdateCheck";
import SystemUpdatesPopup from "./SystemUpdatesPopup";

const applySystemUpdate = vi.hoisted(() => vi.fn());

vi.mock("../../workspace/applySystemUpdate", () => ({
  applySystemUpdate: (...args: unknown[]) => applySystemUpdate(...args),
}));

const info: UpdateCheckInfo = {
  deploymentMode: "self_hosted",
  feedConfigured: true,
  current: { okkey: "1.0.0-betta.3", enterprise: "1.0.0-betta.3" },
  available: [
    { id: "okkey", from: "1.0.0-betta.3", to: "1.0.0-betta.4", notes: "core fixes\nmore polish" },
    { id: "okkey-enterprise", from: "1.0.0-betta.3", to: "1.0.0-betta.4", notes: null },
  ],
};

describe("SystemUpdatesPopup", () => {
  beforeEach(() => {
    applySystemUpdate.mockReset();
  });

  it("renders version + changelog and wires Ignore", () => {
    const onClose = vi.fn();
    const onIgnore = vi.fn();
    render(
      <SystemUpdatesPopup
        open
        mode="available"
        info={info}
        t={(key, values) => {
          if (key === "web.updatesPopup.versionLine" && values) {
            return `Okkey v${String(values.version)}`;
          }
          return key;
        }}
        onClose={onClose}
        onIgnore={onIgnore}
      />,
    );

    expect(screen.getByTestId("system-updates-popup")).toBeInTheDocument();
    expect(screen.getByTestId("system-updates-target-version")).toHaveTextContent(
      "Okkey v1.0.0-betta.4",
    );
    expect(screen.getByTestId("system-updates-changelog")).toHaveTextContent("core fixes");
    expect(screen.getByTestId("system-updates-and-more")).toHaveAttribute(
      "href",
      "https://github.com/okkeyapp/okkey/releases/tag/v1.0.0-betta.4",
    );

    fireEvent.click(screen.getByTestId("system-updates-ignore"));
    expect(onIgnore).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("shows apply error when agent returns UPDATE_APPLY_UNAVAILABLE", async () => {
    applySystemUpdate.mockResolvedValue({
      ok: false,
      error: "UPDATE_APPLY_UNAVAILABLE",
      message: "agent missing",
    });
    render(
      <SystemUpdatesPopup
        open
        mode="available"
        info={info}
        t={(key) => key}
        onClose={vi.fn()}
        onIgnore={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId("system-updates-update"));
    await waitFor(() => {
      expect(screen.getByTestId("system-updates-apply-error")).toHaveTextContent(
        "web.updatesPopup.applyUnavailable",
      );
    });
    expect(applySystemUpdate).toHaveBeenCalledTimes(1);
  });

  it("shows up-to-date alert", () => {
    render(
      <SystemUpdatesPopup
        open
        mode="up_to_date"
        info={null}
        t={(key) => key}
        onClose={vi.fn()}
        onIgnore={vi.fn()}
      />,
    );
    expect(screen.getByTestId("system-updates-up-to-date")).toBeInTheDocument();
  });

  it("renders nothing when closed", () => {
    const { container } = render(
      <SystemUpdatesPopup
        open={false}
        mode="available"
        info={info}
        t={(key) => key}
        onClose={vi.fn()}
        onIgnore={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
