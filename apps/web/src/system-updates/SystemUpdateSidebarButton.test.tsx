import { SidebarProvider } from "@okkey/ui";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import SystemUpdateSidebarButton from "./SystemUpdateSidebarButton";

const fetchMock = vi.fn();
const FULL_SHA = "6e6ee86fac86b6fb1a6cc05da1f71d7e99d70560";

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
  currentVersion: "1.0.0-beta.3",
  commitSha: null as string | null,
  releaseTag: "v1.0.0-beta.3" as string | null,
  enterpriseInstalled: true,
  enterpriseVersion: "1.0.0",
  feedConfigured: true,
  isolated: false,
  canApply: true,
  updates: [
    {
      component: "okkey",
      fromVersion: "1.0.0-beta.3",
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
  seen: {},
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

function renderButton() {
  return render(
    <SidebarProvider>
      <SystemUpdateSidebarButton />
    </SidebarProvider>,
  );
}

describe("system update version button", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    installMemoryStorage();
    status.currentVersion = "1.0.0-beta.3";
    status.commitSha = null;
    status.releaseTag = "v1.0.0-beta.3";
    status.updates[0].toVersion = "1.1.0";
    status.seen = {};
    vi.stubEnv("VITE_DEPLOYMENT_MODE", "self_hosted");
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const target = String(url);
      if (target.endsWith("/system/updates/seen")) {
        return json({ ok: true });
      }
      if (target.endsWith("/system/updates/dismiss")) {
        return json({ ok: true });
      }
      if (target.endsWith("/system/updates") && (!init?.method || init.method === "GET")) {
        return json(status);
      }
      if (target.endsWith("/system/updates/apply")) {
        return json(
          {
            job: {
              id: "11111111-1111-4111-8111-111111111111",
              status: "succeeded",
              progress: 100,
              component: "okkey",
              fromVersion: "1.0.0-beta.3",
              toVersion: "1.1.0",
            },
          },
          202,
        );
      }
      if (target.includes("/system/updates/jobs/")) {
        return json({
          job: {
            id: "11111111-1111-4111-8111-111111111111",
            status: "succeeded",
            progress: 100,
            component: "okkey",
            fromVersion: "1.0.0-beta.3",
            toVersion: "1.1.0",
          },
        });
      }
      throw new Error(`unexpected ${target}`);
    });
  });

  it("renders a tagged version like the sidebar menu and opens the system update popup", async () => {
    const interval = vi.spyOn(window, "setInterval");
    renderButton();

    const button = await screen.findByTestId("system-update-version");
    expect(button).toHaveTextContent("v1.0.0-beta.3");
    expect(button).not.toHaveTextContent(FULL_SHA);
    expect(button.querySelector("svg path")).toHaveAttribute("stroke", "currentColor");
    expect(button.className).toContain("rounded-lg");
    expect(screen.getByTestId("system-update-dot")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(interval.mock.calls.some((call) => call[1] === 60_000)).toBe(false);

    fireEvent.click(button);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Security fixes")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByTestId("system-update-dot")).not.toBeInTheDocument();
    });
    expect(window.localStorage.getItem("okkey.systemUpdate.seen")).toContain("1.1.0");
    expect(window.localStorage.getItem("okkey.systemUpdate.seen")).toContain("2.0.0");
    const seenCall = fetchMock.mock.calls.find((call) => String(call[0]).endsWith("/system/updates/seen"));
    expect(JSON.parse(String(seenCall?.[1]?.body))).toMatchObject({ component: "okkey", version: "1.1.0" });
    expect(interval.mock.calls.some((call) => call[1] === 60_000)).toBe(false);
    interval.mockRestore();
  });

  it("keeps the dot hidden for the same version and shows it again for a newer one", async () => {
    const first = renderButton();
    fireEvent.click(await screen.findByTestId("system-update-version"));
    await waitFor(() => {
      expect(screen.queryByTestId("system-update-dot")).not.toBeInTheDocument();
    });
    first.unmount();

    const second = renderButton();
    expect(await screen.findByTestId("system-update-version")).toHaveAttribute("data-update", "current");
    expect(screen.queryByTestId("system-update-dot")).not.toBeInTheDocument();
    second.unmount();

    status.updates[0].toVersion = "1.2.0";
    renderButton();
    expect(await screen.findByTestId("system-update-dot")).toBeInTheDocument();
  });

  it("shows a short SHA on a dev build and the full SHA as a tooltip", async () => {
    status.releaseTag = null;
    status.commitSha = FULL_SHA;
    renderButton();
    const button = await screen.findByTestId("system-update-version");
    expect(button).toHaveTextContent("v1.0.0-beta.3 6e6ee86");
    expect(button).toHaveAttribute("data-commit-sha", FULL_SHA);
    expect(button).toHaveAttribute("title", FULL_SHA);
  });

  it("stays hidden in SaaS mode", () => {
    vi.stubEnv("VITE_DEPLOYMENT_MODE", "saas");
    renderButton();
    expect(screen.queryByTestId("system-update-version")).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
