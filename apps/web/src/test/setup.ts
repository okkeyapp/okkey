import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach } from "vitest";

import { LOCALE_STORAGE_KEY } from "../locale/localeStorage";

beforeEach(() => {
  try {
    localStorage.removeItem(LOCALE_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  document.documentElement.lang = "en";
});

afterEach(() => {
  cleanup();
});
