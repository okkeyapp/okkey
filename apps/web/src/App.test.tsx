import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import App from "./App";
import { PROFILE_STORAGE_KEY, SESSION_STORAGE_KEY } from "./auth/storageKeys";
import { applyStoredTheme } from "./theme/applyTheme";

function renderWithRouter(ui: ReactElement, initialEntries: string[]) {
  return render(<MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>);
}

function seedBearerSession() {
  const payload = JSON.stringify({
    access_token: "test-token",
    user_id: "00000000-0000-4000-8000-000000000001",
    expires_at: new Date(Date.now() + 3_600_000).toISOString(),
  });
  if (typeof localStorage?.setItem === "function") {
    localStorage.setItem(SESSION_STORAGE_KEY, payload);
  } else {
    sessionStorage.setItem(SESSION_STORAGE_KEY, payload);
  }
}

function clearBearerAndSession() {
  sessionStorage.clear();
  if (typeof localStorage?.removeItem === "function") {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  }
}

describe("App", () => {
  beforeEach(() => {
    clearBearerAndSession();
  });

  it("redirects root to email sign-in when unauthenticated", async () => {
    renderWithRouter(<App />, ["/"]);
    await waitFor(() => {
      expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument();
    });
  });

  it("renders design system gallery on /dev/ui", () => {
    renderWithRouter(<App />, ["/dev/ui"]);
    expect(screen.getByRole("heading", { name: /design system/i })).toBeInTheDocument();
  });

  it("renders email sign-in on /auth/email", () => {
    renderWithRouter(<App />, ["/auth/email"]);
    expect(screen.getByTestId("app-shell-title")).toHaveTextContent("Welcome to Okkey");
    expect(screen.queryByTestId("page-stub-notice")).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^sign in$/i })).toBeInTheDocument();
  });

  it("redirects /auth/email to workspaces when bearer session exists", async () => {
    seedBearerSession();
    renderWithRouter(<App />, ["/auth/email"]);
    await waitFor(() => {
      expect(screen.getByTestId("app-shell-title")).toHaveTextContent("Vault is locked");
    });
    clearBearerAndSession();
  });

  it("redirects /auth/otp to email when challenge is missing", async () => {
    renderWithRouter(<App />, ["/auth/otp"]);
    await waitFor(() => {
      expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument();
    });
  });

  it("redirects /auth/registration when registration state is missing", async () => {
    renderWithRouter(<App />, ["/auth/registration"]);
    await waitFor(() => {
      expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument();
    });
  });

  it("redirects /workspaces to unlock when session exists but vault is locked", async () => {
    seedBearerSession();
    renderWithRouter(<App />, ["/workspaces"]);
    await waitFor(() => {
      expect(screen.getByTestId("app-shell-title")).toHaveTextContent("Vault is locked");
    });
    clearBearerAndSession();
  });

  it("renders vault unlock when authenticated", async () => {
    seedBearerSession();
    sessionStorage.setItem(
      PROFILE_STORAGE_KEY,
      JSON.stringify({
        email: "user@okkey.local",
        firstName: "Test",
        lastName: "User",
      }),
    );
    renderWithRouter(<App />, ["/unlock/password"]);
    await waitFor(() => {
      expect(screen.getByTestId("app-shell-title")).toHaveTextContent("Vault is locked");
    });
    expect(screen.getByText("user@okkey.local")).toBeInTheDocument();
    expect(screen.getByLabelText(/^master password$/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^unlock$/i })).toBeDisabled();
    clearBearerAndSession();
  });

  it("shows error when unlocking without local vault bundle", async () => {
    seedBearerSession();
    sessionStorage.setItem(
      PROFILE_STORAGE_KEY,
      JSON.stringify({ email: "user@okkey.local" }),
    );
    renderWithRouter(<App />, ["/unlock/password"]);
    await waitFor(() => {
      expect(screen.getByLabelText(/^master password$/i)).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText(/^master password$/i), { target: { value: "any" } });
    fireEvent.click(screen.getByRole("button", { name: /^unlock$/i }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    clearBearerAndSession();
  });

  function mockLocalStorage(values: Record<string, string | null>) {
    const storage = {
      getItem: (key: string) => (key in values ? values[key] : null),
      setItem: () => undefined,
      removeItem: () => undefined,
      clear: () => undefined,
      key: () => null,
      length: 0,
    };

    Object.defineProperty(window, "localStorage", {
      value: storage,
      configurable: true,
    });
  }

  function resetDocTheme() {
    document.documentElement.classList.remove("dark");
    document.documentElement.dataset.accent = "";
  }

  it("applies stored theme and accent", () => {
    mockLocalStorage({
      "okkey.theme": "dark",
      "okkey.accent": "a4",
    });
    resetDocTheme();

    applyStoredTheme();

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.dataset.accent).toBe("a4");
  });

  it("defaults to light + accent a2 when storage is empty", () => {
    mockLocalStorage({});
    resetDocTheme();

    applyStoredTheme();

    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.documentElement.dataset.accent).toBe("a2");
  });

  it("falls back to accent a2 on invalid accentId", () => {
    mockLocalStorage({
      "okkey.theme": "dark",
      "okkey.accent": "invalid",
    });
    resetDocTheme();

    applyStoredTheme();

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.dataset.accent).toBe("a2");
  });
});
