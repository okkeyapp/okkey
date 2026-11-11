import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import WorkspaceKeyPendingNotice, { WorkspaceKeyNoticeBoundary } from "./WorkspaceKeyPendingNotice";

const WORKSPACE_ID = "1000000000000000001";

class ApiRequestError extends Error {
  readonly status: number;

  constructor(status: number) {
    super("request failed");
    this.name = "ApiRequestError";
    this.status = status;
  }
}

class HttpApi {
  ready = true;
}

class WorkspaceKeyClient {
  readonly api = new HttpApi();

  constructor(private readonly load: (workspaceId: string) => Promise<unknown>) {}

  getWorkspaceKey(workspaceId: string) {
    if (!this.api) {
      throw new Error("this.api undefined");
    }
    return this.load(workspaceId);
  }
}

describe("WorkspaceKeyPendingNotice", () => {
  it("calls getWorkspaceKey on the client instance and renders the banner", async () => {
    const core = new WorkspaceKeyClient(async (workspaceId) => {
      expect(workspaceId).toBe(WORKSPACE_ID);
      return { current_version: 2, wraps: [{ key_version: 1, encrypted_workspace_key: {} }] };
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
    const core = new WorkspaceKeyClient(async () => ({
      current_version: 2,
      wraps: [{ key_version: 2, encrypted_workspace_key: {} }],
    }));

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

  it("does not let an API throw escape and renders nothing", async () => {
    const core = new WorkspaceKeyClient(async () => {
      throw new ApiRequestError(404);
    });

    expect(() =>
      render(
        <WorkspaceKeyPendingNotice
          core={core as never}
          workspaceId={WORKSPACE_ID}
          t={(key) => key}
        />,
      ),
    ).not.toThrow();

    await waitFor(() => {
      expect(screen.queryByRole("status")).toBeNull();
    });
  });

  it("keeps a render error inside the notice boundary", () => {
    function Boom(): null {
      throw new Error("notice render failed");
    }

    expect(() =>
      render(
        <WorkspaceKeyNoticeBoundary>
          <Boom />
        </WorkspaceKeyNoticeBoundary>,
      ),
    ).not.toThrow();
    expect(screen.queryByRole("status")).toBeNull();
  });
});
