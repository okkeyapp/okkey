import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, vi } from "vitest";

import { LOCALE_STORAGE_KEY } from "../locale/localeStorage";

beforeEach(() => {
  try {
    localStorage.removeItem(LOCALE_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  document.documentElement.lang = "en";

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
