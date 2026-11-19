import type { ProductTourStep } from "@okkey/types";

export const PRODUCT_TOUR_STEP_COUNT = 4 as const;

export const PRODUCT_TOUR_STEPS: readonly ProductTourStep[] = [1, 2, 3, 4];

export function isProductTourStep(value: unknown): value is ProductTourStep {
  return value === 1 || value === 2 || value === 3 || value === 4;
}

export function normalizeProductTourStep(value: unknown): ProductTourStep {
  return isProductTourStep(value) ? value : 1;
}

/** Advance to the next step, or stay on the last step. */
export function nextProductTourStep(step: ProductTourStep): ProductTourStep {
  if (step >= PRODUCT_TOUR_STEP_COUNT) {
    return PRODUCT_TOUR_STEP_COUNT;
  }
  return (step + 1) as ProductTourStep;
}

export function isLastProductTourStep(step: ProductTourStep): boolean {
  return step === PRODUCT_TOUR_STEP_COUNT;
}
