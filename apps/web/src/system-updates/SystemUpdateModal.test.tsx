import { formatWebMessage, type WebMessageValues } from "@okkey/i18n";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import SystemUpdateModal from "./SystemUpdateModal";
import type { SystemUpdateAvailable, SystemUpdateStatus } from "./visibility";

const fetchMock = vi.fn();

function t(key: string, values?: WebMessageValues) {
  return formatWebMessage("en", key, values);
}

function update(
  component: "okkey" | "enterprise",
  toVersion: string,
  extra: Partial<SystemUpdateAvailable> = {},
): SystemUpdateAvailable {
  return {
    component,
    fromVersion: "1.0.0",
    toVersion,
    summary: component === "okkey" ? "Core notes" : "Enterprise notes",
    releasedAt: "2026-11-01T00:00:00.000Z",
    source: "feed",
    minCoreVersion: null,
    releaseNotesUrl:
      component === "okkey" ? "http://updates.example/okkey" : "http://updates.example/enterprise",
    ...extra,
  };
}

function status(overrides: Partial<SystemUpdateStatus> = {}): SystemUpdateStatus {
  const updates = overrides.updates ?? [update("okkey", "2.0.0"), update("enterprise", "3.0.0", { minCoreVersion: "2.0.0" })];
  return {
    deploymentMode: "self_hosted",
    currentVersion: "1.0.0",
    commitSha: null,
    releaseTag: "v1.0.0",
    enterpriseInstalled: true,
    enterpriseVersion: "1.0.0",
    feedConfigured: true,
    isolated: false,
    canApply: true,
    updates,
    components: [
      {
        component: "okkey",
        installedVersion: "1.0.0",
        update: updates.find((item) => item.component === "okkey") ?? null,
        checkError: null,
        feedConfigured: true,
        minCoreVersion: null,
        releaseNotesUrl: updates.find((item) => item.component === "okkey")?.releaseNotesUrl ?? null,
      },
      {
        component: "enterprise",
        installedVersion: "1.0.0",
        update: updates.find((item) => item.component === "enterprise") ?? null,
        checkError: null,
        feedConfigured: true,
        minCoreVersion: updates.find((item) => item.component === "enterprise")?.minCoreVersion ?? null,
        releaseNotesUrl: updates.find((item) => item.component === "enterprise")?.releaseNotesUrl ?? null,
      },
    ],
    dismissed: {},
    seen: {},
    feedError: null,
    offlineArchiveSupported: false,
    ...overrides,
  };
}

function renderModal(value: SystemUpdateStatus = status()) {
  const updates = value.updates;
  return render(
    <SystemUpdateModal
      t={t}
      accessToken="token"
      status={value}
      updates={updates}
      onClose={() => undefined}
      onIgnore={() => undefined}
      onApplied={() => undefined}
    />,
  );
}

function json(body: unknown, statusCode = 200): Response {
  return new Response(JSON.stringify(body), {
    status: statusCode,
    headers: { "Content-Type": "application/json" },
  });
}

function succeededJob(component: string) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    status: "succeeded",
    progress: 100,
    component,
    fromVersion: "1.0.0",
    toVersion: "2.0.0",
  };
}

describe("system update popup", () => {
  const applied: unknown[] = [];

  beforeEach(() => {
    applied.length = 0;
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const target = String(url);
      if (target.endsWith("/system/updates/apply")) {
        const body = JSON.parse(String(init?.body)) as { component?: string; document?: { payload?: { component?: string } } };
        applied.push(body);
        return json(
          { job: succeededJob(body.component ?? body.document?.payload?.component ?? "okkey") },
          202,
        );
      }
      if (target.includes("/system/updates/jobs/")) {
        return json({ job: succeededJob("okkey") });
      }
      if (target.endsWith("/system/updates")) {
        return json(status({ currentVersion: "9.9.9", updates: [] }));
      }
      throw new Error(`unexpected ${target}`);
    });
  });

  it("shows Okkey and Enterprise rows with versions and release notes", () => {
    renderModal();
    expect(screen.getByTestId("system-update-row-okkey")).toHaveTextContent("Current version 1.0.0");
    expect(screen.getByTestId("system-update-row-okkey")).toHaveTextContent("New version 2.0.0");
    expect(screen.getByTestId("system-update-row-enterprise")).toHaveTextContent("New version 3.0.0");
    expect(screen.getByTestId("system-update-notes-okkey")).toHaveAttribute("href", "http://updates.example/okkey");
    expect(screen.getByTestId("system-update-notes-enterprise")).toHaveAttribute(
      "href",
      "http://updates.example/enterprise",
    );
  });

  it("hides the Enterprise row when enterprise modules are off", () => {
    const value = status({ enterpriseInstalled: false, enterpriseVersion: null });
    renderModal(value);
    expect(screen.getByTestId("system-update-row-okkey")).toBeInTheDocument();
    expect(screen.queryByTestId("system-update-row-enterprise")).not.toBeInTheDocument();
  });

  it("keeps the other component when one feed cannot be checked", async () => {
    const core = update("okkey", "2.0.0");
    const value = status({
      updates: [core],
      components: [
        {
          component: "okkey",
          installedVersion: "1.0.0",
          update: core,
          checkError: null,
          feedConfigured: true,
          minCoreVersion: null,
          releaseNotesUrl: core.releaseNotesUrl ?? null,
        },
        {
          component: "enterprise",
          installedVersion: "1.0.0",
          update: null,
          checkError: "FEED_FETCH_FAILED",
          feedConfigured: true,
          minCoreVersion: null,
          releaseNotesUrl: null,
        },
      ],
    });
    renderModal(value);
    expect(screen.getByTestId("system-update-row-okkey")).toHaveTextContent("New version 2.0.0");
    expect(screen.getByTestId("system-update-check-error-enterprise")).toHaveTextContent(
      "Enterprise could not be checked.",
    );
    fireEvent.click(screen.getByTestId("system-update-apply-all"));
    await waitFor(() => {
      expect(applied).toHaveLength(1);
    });
    expect(applied[0]).toMatchObject({ source: "feed", component: "okkey" });
  });

  it("updates core before enterprise and says when enterprise needs a newer core", async () => {
    renderModal();
    expect(screen.getByTestId("system-update-order-notice")).toHaveTextContent(
      "Enterprise needs Okkey 2.0.0 or newer. Okkey updates first.",
    );
    expect(screen.getByTestId("system-update-apply-enterprise")).toBeDisabled();
    fireEvent.click(screen.getByTestId("system-update-apply-all"));
    await waitFor(() => {
      expect(applied).toHaveLength(2);
    });
    expect(applied.map((body) => (body as { component: string }).component)).toEqual(["okkey", "enterprise"]);
  });

  it("does not apply enterprise until the running core reports the new version", async () => {
    const calls: string[] = [];
    let clock = 0;
    let statusReads = 0;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const target = String(url);
      const method = init?.method ?? "GET";
      if (target.endsWith("/system/updates") && method === "GET") {
        statusReads += 1;
        const version = statusReads >= 2 ? "2.0.0" : "1.0.0";
        calls.push(`status:${version}`);
        return json(status({ currentVersion: version, updates: [] }));
      }
      if (target.endsWith("/system/updates/apply")) {
        const body = JSON.parse(String(init?.body)) as { component?: string };
        calls.push(`apply:${body.component}`);
        applied.push(body);
        return json({ job: succeededJob(body.component ?? "okkey") }, 202);
      }
      if (target.includes("/system/updates/jobs/")) {
        return json({ job: succeededJob("okkey") });
      }
      throw new Error(`unexpected ${target}`);
    });
    render(
      <SystemUpdateModal
        t={t}
        accessToken="token"
        status={status()}
        updates={status().updates}
        onClose={() => undefined}
        onIgnore={() => undefined}
        onApplied={() => undefined}
        coreRestart={{
          timeoutMs: 60_000,
          initialDelayMs: 1_000,
          maxDelayMs: 8_000,
          now: () => clock,
          sleep: async (ms) => {
            clock += ms;
          },
        }}
      />,
    );
    fireEvent.click(screen.getByTestId("system-update-apply-all"));
    await waitFor(() => {
      expect(applied).toHaveLength(2);
    });
    expect(calls.filter((call) => call.startsWith("apply") || call.startsWith("status"))).toEqual([
      "apply:okkey",
      "status:1.0.0",
      "status:2.0.0",
      "apply:enterprise",
    ]);
    expect(clock).toBe(1_000);
  });

  it("stops before enterprise when the core never reports the target version", async () => {
    const calls: string[] = [];
    let clock = 0;
    let reloaded = 0;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const target = String(url);
      const method = init?.method ?? "GET";
      if (target.endsWith("/system/updates") && method === "GET") {
        calls.push("status");
        return json(status({ currentVersion: "1.0.0", updates: [] }));
      }
      if (target.endsWith("/system/updates/apply")) {
        const body = JSON.parse(String(init?.body)) as { component?: string };
        calls.push(`apply:${body.component}`);
        applied.push(body);
        return json({ job: succeededJob(body.component ?? "okkey") }, 202);
      }
      if (target.includes("/system/updates/jobs/")) {
        return json({ job: succeededJob("okkey") });
      }
      throw new Error(`unexpected ${target}`);
    });
    render(
      <SystemUpdateModal
        t={t}
        accessToken="token"
        status={status()}
        updates={status().updates}
        onClose={() => undefined}
        onIgnore={() => undefined}
        onApplied={() => {
          reloaded += 1;
        }}
        coreRestart={{
          timeoutMs: 2_500,
          initialDelayMs: 1_000,
          maxDelayMs: 1_000,
          now: () => clock,
          sleep: async (ms) => {
            clock += ms;
          },
        }}
      />,
    );
    fireEvent.click(screen.getByTestId("system-update-apply-all"));
    expect(await screen.findByText("Okkey did not report 2.0.0 in time. Enterprise was not started.")).toBeInTheDocument();
    expect(calls.filter((call) => call.startsWith("apply"))).toEqual(["apply:okkey"]);
    expect(calls.filter((call) => call === "status").length).toBeGreaterThan(1);
    expect(reloaded).toBe(1);
  });

  it("skips enterprise when the core update is still older than minCoreVersion", async () => {
    const core = update("okkey", "1.5.0");
    const enterprise = update("enterprise", "3.0.0", { minCoreVersion: "2.0.0" });
    renderModal(status({ updates: [core, enterprise], currentVersion: "1.0.0" }));
    expect(screen.getByTestId("system-update-order-notice")).toHaveTextContent("not included");
    fireEvent.click(screen.getByTestId("system-update-apply-all"));
    await waitFor(() => {
      expect(applied).toHaveLength(1);
    });
    expect(applied[0]).toMatchObject({ source: "feed", component: "okkey" });
  });

  it("shows CORE_UPDATE_REQUIRED with the same wording as the update agent", async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const target = String(url);
      if (target.endsWith("/system/updates/apply")) {
        const body = JSON.parse(String(init?.body)) as { component?: string };
        applied.push(body);
        return json(
          {
            job: {
              ...succeededJob(body.component ?? "enterprise"),
              status: "failed",
              errorCode: "CORE_UPDATE_REQUIRED",
            },
          },
          202,
        );
      }
      if (target.includes("/system/updates/jobs/")) {
        return json({
          job: {
            ...succeededJob("enterprise"),
            status: "failed",
            errorCode: "CORE_UPDATE_REQUIRED",
          },
        });
      }
      throw new Error(`unexpected ${target}`);
    });
    const enterprise = update("enterprise", "3.0.0", { minCoreVersion: "1.0.0" });
    renderModal(status({ updates: [enterprise], currentVersion: "1.0.0" }));
    fireEvent.click(screen.getByTestId("system-update-apply-enterprise"));
    expect(
      await screen.findByText(
        "Update core first. This enterprise package needs a newer core, so nothing was changed.",
      ),
    ).toBeInTheDocument();
  });

  it("lets one component update on its own when the core is already new enough", async () => {
    const core = update("okkey", "2.1.0");
    const enterprise = update("enterprise", "3.0.0", { minCoreVersion: "2.0.0" });
    renderModal(status({ updates: [core, enterprise], currentVersion: "2.0.0" }));
    expect(screen.queryByTestId("system-update-order-notice")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("system-update-apply-enterprise"));
    await waitFor(() => {
      expect(applied).toHaveLength(1);
    });
    expect(applied[0]).toMatchObject({ source: "feed", component: "enterprise" });
  });

  it("shows component and version for each offline file before Update", async () => {
    renderModal(status({ updates: [], currentVersion: "1.0.0" }));
    const input = document.getElementById("system-update-file") as HTMLInputElement;
    const files = [
      new File(
        [JSON.stringify({ payload: { component: "enterprise", version: "3.1.0", minCoreVersion: "1.2.0" }, signature: "sig" })],
        "enterprise.okpkg",
        { type: "application/json" },
      ),
      new File(
        [JSON.stringify({ payload: { component: "okkey", version: "1.2.0" }, signature: "sig" })],
        "okkey.okpkg",
        { type: "application/json" },
      ),
      new File(["PK"], "both.okbundle", { type: "application/zip" }),
    ];
    Object.defineProperty(input, "files", { configurable: true, value: files });
    fireEvent.change(input);

    const list = await screen.findByTestId("system-update-offline-list");
    await waitFor(() => {
      expect(list).toHaveTextContent("Enterprise 3.1.0");
      expect(list).toHaveTextContent("Okkey 1.2.0");
      expect(list).toHaveTextContent("Combined archive both.okbundle");
    });
    expect(screen.getByTestId("system-update-archive-pending")).toBeInTheDocument();
    expect(applied).toHaveLength(0);

    fireEvent.click(screen.getByTestId("system-update-apply-all"));
    await waitFor(() => {
      expect(applied).toHaveLength(2);
    });
    expect(
      applied.map((body) => (body as { document: { payload: { component: string; version: string } } }).document.payload),
    ).toEqual([
      { component: "okkey", version: "1.2.0" },
      { component: "enterprise", version: "3.1.0", minCoreVersion: "1.2.0" },
    ]);
  });

  it("sends a JSON combined archive when the API can read it", async () => {
    const archive = {
      format: "okkey-offline-bundle",
      packages: [{ payload: { component: "okkey", version: "1.2.0" }, signature: "sig" }],
    };
    renderModal(status({ updates: [], currentVersion: "1.0.0", offlineArchiveSupported: true }));
    const input = document.getElementById("system-update-file") as HTMLInputElement;
    const file = new File([JSON.stringify(archive)], "both.okbundle", { type: "application/json" });
    Object.defineProperty(input, "files", { configurable: true, value: [file] });
    fireEvent.change(input);
    expect(await screen.findByTestId("system-update-offline-list")).toHaveTextContent("Combined archive both.okbundle");
    expect(screen.queryByTestId("system-update-archive-pending")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("system-update-apply-all"));
    await waitFor(() => {
      expect(applied).toHaveLength(1);
    });
    expect(applied[0]).toMatchObject({ source: "file", document: archive });
  });

  it("uses the import file field, keeps several packages, and clears one", async () => {
    renderModal(status({ updates: [], currentVersion: "1.0.0" }));
    const zone = screen.getByRole("button", { name: /Upload file/i });
    expect(zone.className).toContain("hover:border-accent");
    expect(zone.className).toContain("focus-visible:border-accent");
    expect(screen.getByText(/okpkg, json, okbundle, zip/)).toBeInTheDocument();

    const input = document.getElementById("system-update-file") as HTMLInputElement;
    expect(input.multiple).toBe(true);
    const files = [
      new File(
        [JSON.stringify({ payload: { component: "okkey", version: "1.4.0" }, signature: "sig" })],
        "okkey.okpkg",
        { type: "application/json" },
      ),
      new File(
        [JSON.stringify({ payload: { component: "enterprise", version: "3.4.0" }, signature: "sig" })],
        "enterprise.okpkg",
        { type: "application/json" },
      ),
    ];
    Object.defineProperty(input, "files", { configurable: true, value: files });
    fireEvent.change(input);

    const list = await screen.findByTestId("system-update-offline-list");
    await waitFor(() => {
      expect(list).toHaveTextContent("Okkey 1.4.0");
      expect(list).toHaveTextContent("Enterprise 3.4.0");
    });
    expect(screen.getAllByRole("button", { name: "Remove file" })).toHaveLength(2);

    fireEvent.click(screen.getAllByRole("button", { name: "Remove file" })[0]!);
    await waitFor(() => {
      expect(screen.getByTestId("system-update-offline-list")).not.toHaveTextContent("Okkey 1.4.0");
    });
    expect(screen.getByTestId("system-update-offline-list")).toHaveTextContent("Enterprise 3.4.0");
    expect(screen.getAllByRole("button", { name: "Remove file" })).toHaveLength(1);
  });
});
