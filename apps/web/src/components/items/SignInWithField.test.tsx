import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../items/WorkspaceItemsContext", () => ({
  useWorkspaceItems: () => ({
    records: [
      {
        id: "login-google",
        vaultId: "vault-1",
        folderId: null,
        categoryId: "login",
        urls: ["https://accounts.google.com"],
        title: "Google",
        description: "",
        tags: [],
        date: new Date("2026-01-01"),
        favorite: false,
        archived: false,
        deleted: false,
      },
      {
        id: "login-self",
        vaultId: "vault-1",
        folderId: null,
        categoryId: "login",
        urls: ["https://app.example.com"],
        title: "This app",
        description: "",
        tags: [],
        date: new Date("2026-01-01"),
        favorite: false,
        archived: false,
        deleted: false,
      },
      {
        id: "note-1",
        vaultId: "vault-1",
        folderId: null,
        categoryId: "secure_note",
        urls: [],
        title: "Not a login",
        description: "",
        tags: [],
        date: new Date("2026-01-01"),
        favorite: false,
        archived: false,
        deleted: false,
      },
      {
        id: "login-deleted",
        vaultId: "vault-1",
        folderId: null,
        categoryId: "login",
        urls: [],
        title: "Deleted login",
        description: "",
        tags: [],
        date: new Date("2026-01-01"),
        favorite: false,
        archived: false,
        deleted: true,
      },
    ],
  }),
}));

vi.mock("../../items/faviconMode", () => ({
  useClientWebsiteIconSrc: () => null,
}));

vi.mock("./ItemRecordFavicon", () => ({
  default: () => <span data-testid="favicon" />,
}));

import SignInWithField from "./SignInWithField";

const t = (key: string) =>
  (
    {
      "web.newItemPopup.signInWith.label": "Sign in with",
      "web.newItemPopup.signInWith.none": "No linked account",
      "web.newItemPopup.signInWith.search": "Search by title",
      "web.newItemPopup.signInWith.searchEmpty": "No login items found",
    } as Record<string, string>
  )[key] ?? key;

describe("SignInWithField", () => {
  it("lists other login items and excludes self, notes, and deleted items", async () => {
    const onValueChange = vi.fn();
    render(
      <SignInWithField
        t={t}
        value=""
        onValueChange={onValueChange}
        excludeItemId="login-self"
      />,
    );

    fireEvent.click(screen.getByRole("combobox"));
    const listbox = await screen.findByRole("listbox");
    expect(within(listbox).getByText("No linked account")).toBeTruthy();
    expect(within(listbox).getByText("Google")).toBeTruthy();
    expect(within(listbox).queryByText("This app")).toBeNull();
    expect(within(listbox).queryByText("Not a login")).toBeNull();
    expect(within(listbox).queryByText("Deleted login")).toBeNull();
  });

  it("can clear the selection to no linked account", async () => {
    const onValueChange = vi.fn();
    render(
      <SignInWithField t={t} value="login-google" onValueChange={onValueChange} />,
    );

    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(await screen.findByText("No linked account"));
    expect(onValueChange).toHaveBeenCalledWith("");
  });
});
