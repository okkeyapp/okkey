import { SidebarProvider } from "@okkey/ui";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import SystemUpdateSidebarNotice from "./SystemUpdateSidebarNotice";
import { shouldShowUpdate, writeLocalDismissal } from "./visibility";

const fetchMock = vi.fn();

vi.mock("../auth/AuthVaultContext", () => ({
  useAuthVault: () => ({ accessToken: "token" }),
}));

vi.mock("../locale/LocaleContext", () => ({
  useLocale: () => ({
    t: (key: string) => key,
  }),
}));

const status = {
  deploymentMode: "self_hosted",
  currentVersion: "1.0.0-beta.2",
  enterpriseInstalled: true,
  enterpriseVersion: "1.0.0",
  feedConfigured: true,
  isolated: false,
  canApply: true,
  updates: [
    {
      component: "okkey",
      fromVersion: "1.0.0-beta.2",
      toVersion: "1.1.0",
      summary: "Security fixes",
      releasedAt: "2026-11-01T00:00:00.000Z",
      source: "feed",
    },
    {
      component: "enterprise",
      fromVersion: "1.0.0",
      toVersion: "2.0.0",
      summary: "Enterprise module",
      releasedAt: "2026-11-01T00:00:00.000Z",
      source: "feed",
    },
  ],
  dismissed: {},
  feedError: null,
};

function json(body: unknown, statusCode = 200): Response {
  return new Response(JSON.stringify(body), {
    status: statusCode,
    headers: { "Content-Type": "application/json" },
  });
}

function installMemoryStorage(): void {
  const values = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    key(index: number) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key: string) {
      values.delete(key);
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
  Object.defineProperty(window, "localStorage", { configurable: true, value: storage });
}

describe("system update notice", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    installMemoryStorage();
    vi.stubEnv("VITE_DEPLOYMENT_MODE", "self_hosted");
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const target = String(url);
      if (target.endsWith("/system/updates") && (!init?.method || init.method === "GET")) {
        return json(status);
      }
      if (target.endsWith("/system/updates/dismiss")) {
        return json({ ok: true });
      }
      if (target.endsWith("/system/updates/apply")) {
        return json({
          job: {
            id: "11111111-1111-4111-8111-111111111111",
            status: "verifying",
            progress: 15,
            component: "okkey",
            fromVersion: "1.0.0-beta.2",
            toVersion: "1.1.0",
          },
        }, 202);
      }
      if (target.includes("/system/updates/jobs/")) {
        return json({
          job: {
            id: "11111111-1111-4111-8111-111111111111",
            status: "succeeded",
            progress: 100,
            component: "okkey",
            fromVersion: "1.0.0-beta.2",
            toVersion: "1.1.0",
          },
        });
      }
      throw new Error(`unexpected ${target}`);
    });
  });

  it("shows a sidebar notice and does not apply until Update is clicked", async () => {
    render(
      <SidebarProvider>
        <SystemUpdateSidebarNotice />
      </SidebarProvider>,
    );

    const notice = await screen.findByTestId("system-update-notice");
    expect(notice).toHaveAttribute("data-update", "available");
    expect(notice).toHaveTextContent("web.systemUpdate.notice");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.click(notice);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Security fixes")).toBeInTheDocument();
    expect(screen.getByText("Enterprise module")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "web.systemUpdate.ignore" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "web.systemUpdate.update" }));
    await waitFor(() => {
      expect(screen.getByText("web.systemUpdate.progressSucceeded")).toBeInTheDocument();
    });
    const applyCall = fetchMock.mock.calls.find((call) => String(call[0]).endsWith("/system/updates/apply"));
    expect(JSON.parse(String(applyCall?.[1]?.body))).toMatchObject({ source: "feed", component: "okkey" });
  });

  it("keeps an ignored version hidden after refresh until a newer version is published", async () => {
    const first = render(
      <SidebarProvider>
        <SystemUpdateSidebarNotice />
      </SidebarProvider>,
    );
    fireEvent.click(await screen.findByTestId("system-update-notice"));
    fireEvent.click(screen.getByRole("button", { name: "web.systemUpdate.ignore" }));
    await waitFor(() => {
      expect(screen.getByTestId("system-update-notice")).toHaveAttribute("data-update", "current");
    });
    expect(window.localStorage.getItem("okkey.systemUpdate.dismissed")).toContain("1.1.0");

    first.unmount();
    const second = render(
      <SidebarProvider>
        <SystemUpdateSidebarNotice />
      </SidebarProvider>,
    );
    expect(await screen.findByTestId("system-update-notice")).toHaveAttribute("data-update", "current");

    fetchMock.mockImplementation(async () =>
      json({
        ...status,
        updates: [{ ...status.updates[0], toVersion: "1.2.0", summary: "Newer" }, status.updates[1]],
      }),
    );
    second.unmount();
    render(
      <SidebarProvider>
        <SystemUpdateSidebarNotice />
      </SidebarProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId("system-update-notice")).toHaveAttribute("data-update", "available");
    });
    expect(screen.getByText("web.systemUpdate.notice")).toBeInTheDocument();
  });

  it("stays hidden in SaaS mode", () => {
    vi.stubEnv("VITE_DEPLOYMENT_MODE", "saas");
    render(
      <SidebarProvider>
        <SystemUpdateSidebarNotice />
      </SidebarProvider>,
    );
    expect(screen.queryByTestId("system-update-notice")).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("dismiss visibility", () => {
  beforeEach(() => {
    installMemoryStorage();
  });

  it("shows the notice again only for a newer version", () => {
    expect(shouldShowUpdate("1.1.0", "1.1.0")).toBe(false);
    expect(shouldShowUpdate("1.2.0", "1.1.0")).toBe(true);
    writeLocalDismissal("okkey", "1.1.0");
    expect(window.localStorage.getItem("okkey.systemUpdate.dismissed")).toContain("okkey");
  });
});
