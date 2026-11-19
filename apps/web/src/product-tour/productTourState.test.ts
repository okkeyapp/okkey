import { describe, expect, it } from "vitest";

import {
  isLastProductTourStep,
  isProductTourStep,
  nextProductTourStep,
  normalizeProductTourStep,
  PRODUCT_TOUR_STEP_COUNT,
} from "./productTourState";

describe("productTourState", () => {
  it("validates and normalizes steps", () => {
    expect(isProductTourStep(1)).toBe(true);
    expect(isProductTourStep(4)).toBe(true);
    expect(isProductTourStep(0)).toBe(false);
    expect(isProductTourStep(5)).toBe(false);
    expect(normalizeProductTourStep(3)).toBe(3);
    expect(normalizeProductTourStep("x")).toBe(1);
  });

  it("advances until the last step", () => {
    expect(nextProductTourStep(1)).toBe(2);
    expect(nextProductTourStep(3)).toBe(4);
    expect(nextProductTourStep(4)).toBe(PRODUCT_TOUR_STEP_COUNT);
    expect(isLastProductTourStep(4)).toBe(true);
    expect(isLastProductTourStep(2)).toBe(false);
  });
});
