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
  current: { okkey: "1.0.0", enterprise: "1.0.0-beta.1" },
  available: [
    { id: "okkey", from: "1.0.0", to: "1.0.1", notes: "core fixes" },
    { id: "okkey-enterprise", from: "1.0.0-beta.1", to: "1.0.0-beta.2", notes: null },
  ],
};

describe("SystemUpdatesPopup", () => {
  beforeEach(() => {
    applySystemUpdate.mockReset();
  });

  it("renders from→to rows and wires Ignore", () => {
    const onClose = vi.fn();
    const onIgnore = vi.fn();
    render(
      <SystemUpdatesPopup
        open
        info={info}
        t={(key, values) => {
          if (key === "web.updatesPopup.fromTo" && values) {
            return `${String(values.from)} → ${String(values.to)}`;
          }
          return key;
        }}
        onClose={onClose}
        onIgnore={onIgnore}
      />,
    );

    expect(screen.getByTestId("system-updates-popup")).toBeInTheDocument();
    expect(screen.getByTestId("system-updates-item-okkey")).toHaveTextContent("1.0.0 → 1.0.1");
    expect(screen.getByTestId("system-updates-item-okkey")).toHaveTextContent("core fixes");
    expect(screen.getByTestId("system-updates-item-okkey-enterprise")).toHaveTextContent(
      "1.0.0-beta.1 → 1.0.0-beta.2",
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

  it("renders nothing when closed", () => {
    const { container } = render(
      <SystemUpdatesPopup
        open={false}
        info={info}
        t={(key) => key}
        onClose={vi.fn()}
        onIgnore={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
