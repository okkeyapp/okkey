import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, vi } from "vitest";

import { LOCALE_STORAGE_KEY } from "../locale/localeStorage";

// Default web unit tests exercise SaaS `plan_tier` gating unless a case stubs otherwise.
vi.stubEnv("VITE_DEPLOYMENT_MODE", "saas");
vi.stubEnv("VITE_ENTERPRISE_MODULES_ACTIVE", "false");

beforeEach(() => {
  try {
    localStorage.removeItem(LOCALE_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  document.documentElement.lang = "en";
  // Tests that omit okkey.locale expect English. Pin the browser list so a
  // host locale (for example ru-RU) does not change rendered copy.
  Object.defineProperty(navigator, "languages", {
    configurable: true,
    get: () => ["en-US"],
  });
  Object.defineProperty(navigator, "language", {
    configurable: true,
    get: () => "en-US",
  });

  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      onchange: null,
    })),
  });

  class ResizeObserverStub {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
  Object.defineProperty(window, "ResizeObserver", {
    writable: true,
    configurable: true,
    value: ResizeObserverStub,
  });
});

afterEach(() => {
  cleanup();
});
