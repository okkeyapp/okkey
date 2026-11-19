import { formatWebMessage, type WebMessageValues } from "@okkey/i18n";
import { OFFLINE_BUNDLE_MAX_DOCUMENT_BYTES } from "@okkey/types";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import SystemUpdateModal, { isTransientJobPollError } from "./SystemUpdateModal";
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
    enterpriseCommitSha: null,
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
    expect(screen.getByRole("heading", { name: "Offline package" })).toBeInTheDocument();
  });

  it("shows a muted notice when online updates are disabled by the server administrator", () => {
    renderModal(status({ isolated: true, updates: [] }));
    expect(screen.getByTestId("system-update-online-disabled")).toHaveTextContent(
      "Online updates are disabled by the server administrator. Use an offline package below.",
    );
    expect(screen.queryByTestId("system-update-row-okkey")).not.toBeInTheDocument();
    expect(screen.queryByTestId("system-update-apply-all")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Offline package" })).toBeInTheDocument();
  });

  it("appends short commit SHAs to Okkey and Enterprise current versions", () => {
    renderModal(
      status({
        updates: [],
        currentVersion: "1.0.0-betta.3",
        commitSha: "6e6ee86abcdef0123456789abcdef0123456789",
        enterpriseCommitSha: "abcdef0123456789abcdef0123456789abcdef01",
        components: [
          {
            component: "okkey",
            installedVersion: "1.0.0-betta.3",
            update: null,
            checkError: null,
            feedConfigured: true,
            minCoreVersion: null,
            releaseNotesUrl: null,
          },
          {
            component: "enterprise",
            installedVersion: "1.0.0-betta.3",
            update: null,
            checkError: null,
            feedConfigured: true,
            minCoreVersion: null,
            releaseNotesUrl: null,
          },
        ],
      }),
    );
    expect(screen.getByTestId("system-update-row-okkey")).toHaveTextContent(
      "Current version 1.0.0-betta.3 (core 6e6ee86 · enterprise abcdef0)",
    );
    expect(screen.getByTestId("system-update-row-enterprise")).toHaveTextContent(
      "Current version 1.0.0-betta.3 (abcdef0)",
    );
  });

  it("keeps a core-only Okkey SHA when enterpriseCommitSha is absent", () => {
    renderModal(
      status({
        updates: [],
        currentVersion: "0.0.0-dev",
        commitSha: "6e6ee86abcdef0123456789abcdef0123456789",
        enterpriseCommitSha: null,
        enterpriseInstalled: false,
        components: [
          {
            component: "okkey",
            installedVersion: "0.0.0-dev",
            update: null,
            checkError: null,
            feedConfigured: true,
            minCoreVersion: null,
            releaseNotesUrl: null,
          },
        ],
      }),
    );
    expect(screen.getByTestId("system-update-row-okkey")).toHaveTextContent(
      "Current version 0.0.0-dev (6e6ee86)",
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

  it("lists a pending combined archive without auto-applying", async () => {
    renderModal(status({ updates: [], currentVersion: "1.0.0" }));
    const input = document.getElementById("system-update-file") as HTMLInputElement;
    const files = [
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
      expect(list).toHaveTextContent("Okkey 1.2.0");
      expect(list).toHaveTextContent("Combined archive both.okbundle");
    });
    expect(screen.getByTestId("system-update-archive-pending")).toBeInTheDocument();
    expect(applied).toHaveLength(0);
  });

  it("rejects an oversized offline file on selection with a localized message", async () => {
    renderModal(status({ updates: [], currentVersion: "1.0.0", offlineArchiveSupported: true }));
    const input = document.getElementById("system-update-file") as HTMLInputElement;
    const file = new File(["x"], "huge.okbundle", { type: "application/zip" });
    Object.defineProperty(file, "size", { value: OFFLINE_BUNDLE_MAX_DOCUMENT_BYTES + 1 });
    Object.defineProperty(input, "files", { configurable: true, value: [file] });
    fireEvent.change(input);

    expect(
      await screen.findByText("The offline package is larger than the allowed size."),
    ).toBeInTheDocument();
    expect(formatWebMessage("ru", "web.systemUpdate.error.PACKAGE_TOO_LARGE")).toBe(
      "Офлайн-пакет больше допустимого размера.",
    );
    expect(applied).toHaveLength(0);
    expect(screen.queryByTestId("system-update-offline-list")).not.toBeInTheDocument();
  });

  it("auto-applies an uploaded zip once archive support is on", async () => {
    renderModal(status({ updates: [], currentVersion: "1.0.0", offlineArchiveSupported: true }));
    const input = document.getElementById("system-update-file") as HTMLInputElement;
    const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00]);
    const file = new File([bytes], "release.zip", { type: "application/zip" });
    Object.defineProperty(input, "files", { configurable: true, value: [file] });
    fireEvent.change(input);

    expect(await screen.findByTestId("system-update-offline-list")).toHaveTextContent(
      "Combined archive release.zip",
    );
    expect(screen.queryByTestId("system-update-archive-pending")).not.toBeInTheDocument();
    await waitFor(() => {
      expect(applied).toHaveLength(1);
    });
    expect(applied[0]).toMatchObject({
      source: "file",
      document: {
        format: "okkey-offline-bundle",
        formatVersion: 1,
        archiveBase64: btoa("PK\u0003\u0004\u0000"),
      },
    });
  });

  it("auto-applies a JSON combined archive after a successful check", async () => {
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
    await waitFor(() => {
      expect(applied).toHaveLength(1);
    });
    expect(applied[0]).toMatchObject({ source: "file", document: archive });
  });

  it("says the enterprise license expired instead of a generic feed error", () => {
    const value = status({ updates: [], enterpriseLicenseLapsed: true });
    value.components = [
      {
        component: "okkey",
        installedVersion: "1.0.0",
        update: null,
        checkError: null,
        feedConfigured: true,
        minCoreVersion: null,
        releaseNotesUrl: null,
      },
      {
        component: "enterprise",
        installedVersion: "1.0.0",
        update: null,
        checkError: "LICENSE_EXPIRED",
        feedConfigured: true,
        minCoreVersion: null,
        releaseNotesUrl: null,
      },
    ];
    renderModal(value);
    expect(screen.getByTestId("system-update-check-error-enterprise")).toHaveTextContent(
      "The enterprise license has expired.",
    );
    expect(formatWebMessage("ru", "web.systemUpdate.error.LICENSE_EXPIRED")).toBe(
      "Срок лицензии Enterprise истёк.",
    );
    expect(screen.queryByText("Enterprise could not be checked.")).toBeNull();
    expect(screen.getByRole("heading", { name: "Online update" })).toBeInTheDocument();
  });

  it("auto-applies valid offline packages after upload", async () => {
    renderModal(status({ updates: [], currentVersion: "1.0.0" }));
    expect(screen.getByRole("heading", { name: "Online update" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Offline package" })).toBeInTheDocument();
    expect(screen.getByTestId("system-update-section-divider")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Upload offline package/i })).toBeInTheDocument();
    expect(screen.queryByTestId("system-update-apply-all")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ignore" })).not.toBeInTheDocument();

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
    await waitFor(() => {
      expect(applied).toHaveLength(2);
    });
    expect(
      applied.map((body) => (body as { document: { payload: { component: string; version: string } } }).document.payload),
    ).toEqual([
      { component: "okkey", version: "1.4.0" },
      { component: "enterprise", version: "3.4.0" },
    ]);
  });

  it("shows an offline error for a custom JSON that is not a signed package", async () => {
    renderModal(status({ updates: [], currentVersion: "1.0.0" }));
    const input = document.getElementById("system-update-file") as HTMLInputElement;
    const file = new File([JSON.stringify({ hello: "world" })], "custom.json", {
      type: "application/json",
    });
    // Mimic a live FileList that empties when the input value is cleared.
    const liveFiles = {
      0: file,
      length: 1,
      item: (index: number) => (index === 0 ? file : null),
      *[Symbol.iterator]() {
        if (this.length > 0) {
          yield file;
        }
      },
    };
    Object.defineProperty(input, "files", {
      configurable: true,
      get() {
        return liveFiles;
      },
    });
    const clearValue = () => {
      liveFiles.length = 0;
      delete (liveFiles as { 0?: File })[0];
    };
    Object.defineProperty(input, "value", {
      configurable: true,
      get() {
        return liveFiles.length > 0 ? "C:\\fakepath\\custom.json" : "";
      },
      set(next: string) {
        if (next === "") {
          clearValue();
        }
      },
    });
    fireEvent.change(input);

    expect(await screen.findByTestId("system-update-offline-list")).toHaveTextContent("custom.json");
    expect(await screen.findByTestId("system-update-offline-error")).toHaveTextContent(
      "The file is not an Okkey offline package",
    );
    expect(applied).toHaveLength(0);
  });

  it("uses the settled job scope for the success text", async () => {
    const enterpriseOnly = status({
      updates: [update("enterprise", "3.0.0")],
      currentVersion: "2.0.0",
    });
    const job = {
      ...succeededJob("enterprise"),
      toVersion: "3.0.0",
      result: { scope: "enterprise" as const, enterpriseVersion: "3.0.0" },
    };
    fetchMock.mockImplementation(async (url: string) => {
      const target = String(url);
      if (target.endsWith("/system/updates/apply")) {
        return json({ job }, 202);
      }
      if (target.includes("/system/updates/jobs/")) {
        return json({ job });
      }
      return json(enterpriseOnly);
    });
    renderModal(enterpriseOnly);
    fireEvent.click(screen.getByTestId("system-update-apply-enterprise"));
    expect(await screen.findByText("Update applied. Enterprise 3.0.0 installed.")).toBeTruthy();
  });

  it("shows a bundle success from the job result", async () => {
    const job = {
      ...succeededJob("okkey"),
      toVersion: "1.2.0",
      result: { scope: "bundle" as const, coreVersion: "1.2.0", enterpriseVersion: "2.0.0" },
      components: [
        { component: "okkey" as const, version: "1.2.0", applied: true },
        { component: "enterprise" as const, version: "2.0.0", applied: true },
      ],
    };
    fetchMock.mockImplementation(async (url: string) => {
      const target = String(url);
      if (target.endsWith("/system/updates/apply")) {
        return json({ job }, 202);
      }
      if (target.includes("/system/updates/jobs/")) {
        return json({ job });
      }
      return json(status());
    });
    renderModal(status({ updates: [update("okkey", "1.2.0")], currentVersion: "1.0.0" }));
    fireEvent.click(screen.getByTestId("system-update-apply-okkey"));
    expect(await screen.findByText("Okkey 1.2.0 and Enterprise 2.0.0 were applied.")).toBeTruthy();
  });

  it("warns on a partial bundle and retries enterprise", async () => {
    const job = {
      id: "11111111-1111-4111-8111-111111111111",
      status: "failed",
      progress: 100,
      component: "okkey",
      fromVersion: "1.0.0",
      toVersion: "1.2.0",
      errorCode: "BUNDLE_PARTIAL",
      result: { scope: "partial", coreVersion: "1.2.0", enterpriseVersion: "2.0.0" },
      components: [
        { component: "okkey", version: "1.2.0", applied: true },
        { component: "enterprise", version: "2.0.0", applied: false },
      ],
    };
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const target = String(url);
      if (target.endsWith("/system/updates/apply")) {
        const body = JSON.parse(String(init?.body)) as { component?: string };
        applied.push(body);
        if (body.component === "enterprise") {
          const done = {
            ...succeededJob("enterprise"),
            toVersion: "3.0.0",
            result: { scope: "enterprise", enterpriseVersion: "3.0.0" },
          };
          return json({ job: done }, 202);
        }
        return json({ job }, 202);
      }
      if (target.includes("/system/updates/jobs/")) {
        const last = applied[applied.length - 1] as { component?: string } | undefined;
        if (last?.component === "enterprise") {
          return json({
            job: {
              ...succeededJob("enterprise"),
              toVersion: "3.0.0",
              result: { scope: "enterprise", enterpriseVersion: "3.0.0" },
            },
          });
        }
        return json({ job });
      }
      return json(status({ currentVersion: "1.2.0" }));
    });
    renderModal(
      status({
        updates: [update("okkey", "1.2.0"), update("enterprise", "3.0.0")],
      }),
    );
    fireEvent.click(screen.getByTestId("system-update-apply-okkey"));
    const warning = await screen.findByTestId("system-update-partial");
    expect(warning).toHaveTextContent(
      "Okkey 1.2.0 was applied. Enterprise stayed on the previous version. Retry the Enterprise update.",
    );
    expect(warning).toHaveTextContent("Okkey was applied. Enterprise was not applied and was rolled back.");
    expect(screen.queryByText("Update failed. This instance is still on the previous version.")).toBeNull();
    fireEvent.click(screen.getByTestId("system-update-retry-enterprise"));
    expect(await screen.findByText("Update applied. Enterprise 3.0.0 installed.")).toBeTruthy();
    expect(applied.map((body) => (body as { component?: string }).component)).toEqual(["okkey", "enterprise"]);
  });

  it("reads core, enterprise, and partial results after the API drops mid-apply", async () => {
    expect(isTransientJobPollError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isTransientJobPollError(Object.assign(new Error("no"), { status: 401, code: "AUTH_REQUIRED" }))).toBe(
      false,
    );

    const value = status({
      updates: [update("okkey", "1.2.0"), update("enterprise", "3.0.0")],
      currentVersion: "1.0.0",
    });
    const cases: Array<{ button: string; job: Record<string, unknown>; text: string; partial?: boolean }> = [
      {
        button: "system-update-apply-okkey",
        job: {
          ...succeededJob("okkey"),
          toVersion: "1.2.0",
          result: { scope: "core", coreVersion: "1.2.0" },
        },
        text: "Update applied. Okkey is restarting on 1.2.0.",
      },
      {
        button: "system-update-apply-enterprise",
        job: {
          ...succeededJob("enterprise"),
          toVersion: "3.0.0",
          result: { scope: "enterprise", enterpriseVersion: "3.0.0" },
        },
        text: "Update applied. Enterprise 3.0.0 installed.",
      },
      {
        button: "system-update-apply-okkey",
        job: {
          id: "11111111-1111-4111-8111-111111111111",
          status: "failed",
          progress: 100,
          component: "okkey",
          fromVersion: "1.0.0",
          toVersion: "1.2.0",
          errorCode: "BUNDLE_PARTIAL",
          result: { scope: "partial", coreVersion: "1.2.0", enterpriseVersion: "2.0.0" },
        },
        text: "Okkey 1.2.0 was applied. Enterprise stayed on the previous version.",
        partial: true,
      },
    ];

    for (const item of cases) {
      let misses = 2;
      fetchMock.mockImplementation(async (url: string) => {
        const target = String(url);
        if (target.endsWith("/system/updates/apply")) {
          return json({ job: { ...item.job, status: "applying", progress: 40, errorCode: undefined } }, 202);
        }
        if (target.includes("/system/updates/jobs/")) {
          if (misses > 0) {
            misses -= 1;
            throw new TypeError("Failed to fetch");
          }
          return json({ job: item.job });
        }
        return json(status({ currentVersion: "1.2.0", updates: [] }));
      });
      const view = renderModal(value);
      fireEvent.click(screen.getByTestId(item.button));
      if (item.partial) {
        const warning = await screen.findByTestId("system-update-partial", {}, { timeout: 4000 });
        expect(warning).toHaveTextContent(item.text);
        expect(warning).toHaveTextContent("Retry Enterprise update");
        expect(screen.queryByText("Update failed. This instance is still on the previous version.")).toBeNull();
      } else {
        expect(await screen.findByText(item.text, {}, { timeout: 4000 })).toBeTruthy();
        expect(screen.queryByText("Update failed. This instance is still on the previous version.")).toBeNull();
      }
      view.unmount();
    }
  }, 20_000);
});
