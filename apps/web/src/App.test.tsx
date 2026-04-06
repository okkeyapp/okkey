import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import App from "./App";
import { applyStoredTheme } from "./theme/applyTheme";

function renderWithRouter(ui: ReactElement, initialEntries: string[]) {
  return render(<MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>);
}

describe("App", () => {
  it("renders home title", () => {
    renderWithRouter(<App />, ["/"]);
    expect(screen.getByRole("heading", { name: /^okkey$/i })).toBeInTheDocument();
  });

  it("renders design system gallery on /dev/ui", () => {
    renderWithRouter(<App />, ["/dev/ui"]);
    expect(screen.getByRole("heading", { name: /design system/i })).toBeInTheDocument();
  });

  it.each([
    ["/auth/email", "Sign in with email"],
    ["/auth/otp", "Check your email"],
    ["/auth/registration", "Create account"],
    ["/auth/password", "Master password"],
  ] as const)("renders auth placeholder on %s", (path, titleText) => {
    renderWithRouter(<App />, [path]);
    expect(screen.getByTestId("app-shell-title")).toHaveTextContent(titleText);
    expect(screen.getByTestId("page-stub-notice")).toBeInTheDocument();
  });

  it("renders workspaces layout and workspace cards", () => {
    renderWithRouter(<App />, ["/workspaces"]);
    expect(screen.getByTestId("app-shell-title")).toHaveTextContent("Welcome to Okkey");
    expect(screen.queryByTestId("page-stub-notice")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /personal/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /yandex team/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create workspace/i })).toBeInTheDocument();
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
