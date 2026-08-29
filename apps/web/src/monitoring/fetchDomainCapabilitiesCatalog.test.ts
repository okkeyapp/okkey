import { describe, expect, it, vi, afterEach } from "vitest";

import { fetchFirstJson } from "./fetchDomainCapabilitiesCatalog";

describe("fetchFirstJson", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns the first successful mirror and aborts slower ones", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("slow")) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        return new Response(JSON.stringify({ value: "slow" }), { status: 200 });
      }
      if (url.includes("fast")) {
        return new Response(JSON.stringify({ value: "fast" }), { status: 200 });
      }
      return new Response("nope", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchFirstJson(
      ["https://example.test/fail.json", "https://example.test/fast.json", "https://example.test/slow.json"],
      (raw) => {
        if (!raw || typeof raw !== "object" || !("value" in raw)) {
          return null;
        }
        return raw as { value: string };
      },
      { timeoutMs: 1000, label: "test" },
    );

    expect(result.value).toBe("fast");
    expect(info).toHaveBeenCalled();
    info.mockRestore();
  });

  it("fails when every mirror errors", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("missing", { status: 404 })),
    );

    await expect(
      fetchFirstJson(["https://example.test/a.json", "https://example.test/b.json"], () => ({ ok: true }), {
        timeoutMs: 500,
        label: "test-fail",
      }),
    ).rejects.toThrow();
    expect(info).toHaveBeenCalled();
    info.mockRestore();
  });
});
