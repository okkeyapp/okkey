import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ProductTourOverlay } from "./ProductTourOverlay";

afterEach(() => {
  cleanup();
});

describe("ProductTourOverlay", () => {
  it("renders copy and fires next / skip", () => {
    const onNext = vi.fn();
    const onSkip = vi.fn();
    render(
      <ProductTourOverlay
        title="Create items"
        body="Use this button."
        nextLabel="Next"
        skipLabel="Skip tour"
        anchorSelectors={[]}
        fullDim
        onNext={onNext}
        onSkip={onSkip}
      />,
    );

    expect(screen.getByTestId("product-tour-overlay")).toBeTruthy();
    expect(screen.getByText("Create items")).toBeTruthy();
    fireEvent.click(screen.getByTestId("product-tour-next"));
    fireEvent.click(screen.getByTestId("product-tour-skip"));
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onSkip).toHaveBeenCalledTimes(1);
  });
});
