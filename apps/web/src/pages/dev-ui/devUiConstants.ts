import { applyStoredTheme } from "../../theme/applyTheme";

export const ACCENT_IDS = ["a1", "a2", "a3", "a4", "a5", "a6", "a7"] as const;

export type AccentId = (typeof ACCENT_IDS)[number];

export function readAccentFromStorage(): AccentId {
  try {
    const raw = window.localStorage.getItem("okkey.accent");
    return raw && (ACCENT_IDS as readonly string[]).includes(raw) ? (raw as AccentId) : "a2";
  } catch {
    return "a2";
  }
}

export function setStoredAccent(accent: AccentId) {
  window.localStorage.setItem("okkey.accent", accent);
  applyStoredTheme();
}

export const GALLERY_FRUITS = [
  ["apple", "Apple"],
  ["apricot", "Apricot"],
  ["banana", "Banana"],
  ["cherry", "Cherry"],
  ["fig", "Fig"],
  ["grape", "Grape"],
  ["kiwi", "Kiwi"],
  ["lemon", "Lemon"],
  ["lime", "Lime"],
  ["mango", "Mango"],
  ["melon", "Melon"],
  ["orange", "Orange"],
  ["peach", "Peach"],
  ["pear", "Pear"],
  ["plum", "Plum"],
] as const;

export const DEV_UI_SELECT_BUTTON_VARIANTS = ["default", "secondary", "outline", "destructive", "ghost"] as const;

export const DEV_UI_ICON_BUTTON_VARIANTS = ["default", "secondary", "outline", "ghost", "destructive"] as const;

export const DEV_UI_YANDEX_FAVICON = "https://favicon.yandex.net/favicon/yandex.ru?size=120";

export const MOCK_USERS = [
  { id: "u1", first: "Alice", last: "Anderson", email: "alice.anderson@example.com" },
  { id: "u2", first: "Bob", last: "Bennett", email: "bob.bennett@example.com" },
  { id: "u3", first: "Claire", last: "Collins", email: "claire.collins@example.com" },
  { id: "u4", first: "David", last: "Dawson", email: "david.dawson@example.com" },
  { id: "u5", first: "Emma", last: "Ellis", email: "emma.ellis@example.com" },
  { id: "u6", first: "Frank", last: "Foster", email: "frank.foster@example.com" },
  { id: "u7", first: "Grace", last: "Graham", email: "grace.graham@example.com" },
  { id: "u8", first: "Henry", last: "Hughes", email: "henry.hughes@example.com" },
  { id: "u9", first: "Ivy", last: "Irwin", email: "ivy.irwin@example.com" },
  { id: "u10", first: "Jack", last: "Jordan", email: "jack.jordan@example.com" },
] as const;
