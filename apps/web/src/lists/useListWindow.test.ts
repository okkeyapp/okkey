import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LIST_PAGE_SIZE } from "./listPageSize";
import { useListWindow } from "./useListWindow";

describe("useListWindow", () => {
  it("starts with one page and grows by pageSize", () => {
    const { result } = renderHook(() =>
      useListWindow({ total: 75, pageSize: LIST_PAGE_SIZE, resetKey: "a" }),
    );

    expect(result.current.visibleCount).toBe(30);
    expect(result.current.hasMore).toBe(true);

    act(() => {
      result.current.loadMore();
    });
    expect(result.current.visibleCount).toBe(60);

    act(() => {
      result.current.loadMore();
    });
    expect(result.current.visibleCount).toBe(75);
    expect(result.current.hasMore).toBe(false);
  });

  it("resets to one page when resetKey changes", () => {
    const { result, rerender } = renderHook(
      ({ resetKey, total }: { resetKey: string; total: number }) =>
        useListWindow({ total, pageSize: 30, resetKey }),
      { initialProps: { resetKey: "all", total: 90 } },
    );

    act(() => {
      result.current.loadMore();
    });
    expect(result.current.visibleCount).toBe(60);

    rerender({ resetKey: "favorites", total: 90 });
    expect(result.current.visibleCount).toBe(30);
  });

  it("clamps when total shrinks below the current window without full reset", () => {
    const { result, rerender } = renderHook(
      ({ total }: { total: number }) => useListWindow({ total, pageSize: 30, resetKey: "scope" }),
      { initialProps: { total: 80 } },
    );

    act(() => {
      result.current.loadMore();
    });
    expect(result.current.visibleCount).toBe(60);

    rerender({ total: 12 });
    expect(result.current.visibleCount).toBe(12);
    expect(result.current.hasMore).toBe(false);
  });

  it("keeps the scrolled window when total grows (sync refresh)", () => {
    const { result, rerender } = renderHook(
      ({ total }: { total: number }) => useListWindow({ total, pageSize: 30, resetKey: "scope" }),
      { initialProps: { total: 50 } },
    );

    act(() => {
      result.current.loadMore();
    });
    expect(result.current.visibleCount).toBe(50);

    rerender({ total: 55 });
    expect(result.current.visibleCount).toBe(50);
    expect(result.current.hasMore).toBe(true);
  });

  it("does not exceed total on loadMore", () => {
    const { result } = renderHook(() =>
      useListWindow({ total: 10, pageSize: 30, resetKey: "x" }),
    );
    expect(result.current.visibleCount).toBe(10);
    act(() => {
      result.current.loadMore();
    });
    expect(result.current.visibleCount).toBe(10);
  });
});