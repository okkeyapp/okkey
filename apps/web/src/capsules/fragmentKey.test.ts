import { describe, expect, it, vi } from "vitest";

import { captureCapsuleFragmentKey } from "./fragmentKey";

function storageMock(initial?: string) {
  const values = new Map<string, string>();
  if (initial) values.set("okkey:capsule-key:capsule-1", initial);
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
  };
}

describe("captureCapsuleFragmentKey", () => {
  it("stores the fragment key and immediately removes the fragment", () => {
    const storage = storageMock();
    const history = { replaceState: vi.fn() };

    const key = captureCapsuleFragmentKey(
      "capsule-1",
      { hash: "#key=secret-key", pathname: "/capsule/capsule-1", search: "?theme=dark" },
      history,
      storage,
    );

    expect(key).toBe("secret-key");
    expect(storage.setItem).toHaveBeenCalledWith("okkey:capsule-key:capsule-1", "secret-key");
    expect(history.replaceState).toHaveBeenCalledWith(
      null,
      "",
      "/capsule/capsule-1?theme=dark",
    );
  });

  it("restores the key from session storage when the fragment is absent", () => {
    const storage = storageMock("stored-key");
    const history = { replaceState: vi.fn() };

    expect(
      captureCapsuleFragmentKey(
        "capsule-1",
        { hash: "", pathname: "/capsule/capsule-1", search: "" },
        history,
        storage,
      ),
    ).toBe("stored-key");
    expect(history.replaceState).not.toHaveBeenCalled();
  });
});
