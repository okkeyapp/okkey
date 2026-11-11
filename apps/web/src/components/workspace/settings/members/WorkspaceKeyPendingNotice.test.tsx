import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import WorkspaceKeyPendingNotice from "./WorkspaceKeyPendingNotice";

const WORKSPACE_ID = "1000000000000000001";

class ApiRequestError extends Error {
  readonly status: number;

  constructor(status: number) {
    super("request failed");
    this.name = "ApiRequestError";
    this.status = status;
  }
}

function client(getWorkspaceKey: (workspaceId: string) => Promise<unknown>) {
  return {
    api: { ready: true },
    getWorkspaceKey,
  };
}

describe("WorkspaceKeyPendingNotice", () => {
  it("renders when the caller has no wrap for the current key version", async () => {
    const core = client(function getWorkspaceKey(this: { api?: { ready: boolean } }, workspaceId: string) {
      if (!this?.api) {
        throw new Error("this.api undefined");
      }
      expect(workspaceId).toBe(WORKSPACE_ID);
      return Promise.resolve({ current_version: 2, wraps: [{ key_version: 1, encrypted_workspace_key: {} }] });
    });

    render(
      <WorkspaceKeyPendingNotice
        core={core as never}
        workspaceId={WORKSPACE_ID}
        t={(key) => key}
      />,
    );

    expect(await screen.findByRole("status")).toHaveTextContent(
      "web.workspace.workspaceKey.pendingNotice",
    );
  });

  it("stays hidden when the caller holds the current wrap", async () => {
    const core = client(function getWorkspaceKey(this: { api?: { ready: boolean } }) {
      if (!this?.api) {
        throw new Error("this.api undefined");
      }
      return Promise.resolve({
        current_version: 2,
        wraps: [{ key_version: 2, encrypted_workspace_key: {} }],
      });
    });

    render(
      <WorkspaceKeyPendingNotice
        core={core as never}
        workspaceId={WORKSPACE_ID}
        t={(key) => key}
      />,
    );

    await waitFor(() => {
      expect(screen.queryByRole("status")).toBeNull();
    });
  });

  it("swallows an API error and renders nothing", async () => {
    const core = client(function getWorkspaceKey(this: { api?: { ready: boolean } }) {
      if (!this?.api) {
        throw new Error("this.api undefined");
      }
      return Promise.reject(new ApiRequestError(404));
    });

    render(
      <WorkspaceKeyPendingNotice
        core={core as never}
        workspaceId={WORKSPACE_ID}
        t={(key) => key}
      />,
    );

    await waitFor(() => {
      expect(screen.queryByRole("status")).toBeNull();
    });
  });
});
