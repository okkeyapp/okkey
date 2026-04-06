import { fireEvent, render, screen } from "@testing-library/react";
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

  it("renders email sign-in on /auth/email", () => {
    renderWithRouter(<App />, ["/auth/email"]);
    expect(screen.getByTestId("app-shell-title")).toHaveTextContent("Welcome to Okkey");
    expect(screen.queryByTestId("page-stub-notice")).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^sign in$/i })).toBeInTheDocument();
  });

  it("renders OTP verification on /auth/otp", () => {
    renderWithRouter(<App />, ["/auth/otp"]);
    expect(screen.getByTestId("app-shell-title")).toHaveTextContent("Welcome to Okkey");
    expect(screen.queryByTestId("page-stub-notice")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^sign in$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /send again/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /different email/i })).toBeInTheDocument();
    expect(screen.getAllByRole("textbox")).toHaveLength(6);
  });

  it("renders registration on /auth/registration", () => {
    renderWithRouter(<App />, ["/auth/registration"]);
    expect(screen.getByTestId("app-shell-title")).toHaveTextContent("Register with Okkey");
    expect(screen.queryByTestId("page-stub-notice")).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^first name$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^last name$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^master password$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^repeat master password$/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^register$/i })).toBeDisabled();
    expect(screen.getByRole("link", { name: /different email/i })).toBeInTheDocument();
  });

  it("renders vault unlock on /unlock/password", () => {
    renderWithRouter(<App />, ["/unlock/password"]);
    expect(screen.getByTestId("app-shell-title")).toHaveTextContent("Vault is locked");
    expect(screen.queryByTestId("page-stub-notice")).not.toBeInTheDocument();
    expect(screen.getByText("Alexander Zorin")).toBeInTheDocument();
    expect(screen.getByText("alexzorin@okkey.app")).toBeInTheDocument();
    expect(screen.getByLabelText(/^master password$/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^unlock$/i })).toBeDisabled();
    expect(screen.getByRole("link", { name: /sign out/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /forgot master password/i })).toBeInTheDocument();
  });

  it("shows error alert after unlock submit on /unlock/password", () => {
    renderWithRouter(<App />, ["/unlock/password"]);
    fireEvent.change(screen.getByLabelText(/^master password$/i), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: /^unlock$/i }));
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^error$/i })).toBeInTheDocument();
    expect(screen.getByText("Incorrect master password")).toBeInTheDocument();
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
