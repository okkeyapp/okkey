import type { ProductTourStep } from "@okkey/types";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { useAuthenticatedCoreClient } from "../auth/AuthVaultContext";
import { normalizeAccountProfileWire } from "../auth/normalizeAccountProfileWire";
import { isProductTourStep, normalizeProductTourStep } from "./productTourState";

export type ProductTourContextValue = {
  ready: boolean;
  completed: boolean;
  step: ProductTourStep;
  setStep: (step: ProductTourStep) => Promise<void>;
  complete: () => Promise<void>;
  skip: () => Promise<void>;
};

const ProductTourContext = createContext<ProductTourContextValue | null>(null);

export function ProductTourProvider({ children }: { children: ReactNode }) {
  const core = useAuthenticatedCoreClient();
  const [ready, setReady] = useState(false);
  const [completed, setCompleted] = useState(true);
  const [step, setStepState] = useState<ProductTourStep>(1);
  const completedRef = useRef(completed);
  const stepRef = useRef(step);

  useEffect(() => {
    completedRef.current = completed;
  }, [completed]);

  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  useEffect(() => {
    if (!core) {
      setReady(false);
      setCompleted(true);
      setStepState(1);
      return;
    }

    let cancelled = false;
    setReady(false);

    void (async () => {
      try {
        const raw = (await core.getAccountProfile()) as unknown;
        if (cancelled) {
          return;
        }
        const dto = normalizeAccountProfileWire(raw);
        if (!dto) {
          setCompleted(true);
          setStepState(1);
          return;
        }
        setCompleted(Boolean(dto.product_tour_completed));
        setStepState(normalizeProductTourStep(dto.product_tour_step));
      } catch {
        if (!cancelled) {
          // Older API / offline: do not block the workspace with a tour.
          setCompleted(true);
          setStepState(1);
        }
      } finally {
        if (!cancelled) {
          setReady(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [core]);

  const patchTour = useCallback(
    async (patch: { product_tour_completed?: boolean; product_tour_step?: ProductTourStep }) => {
      if (!core) {
        return;
      }
      const response = await core.updateAccountProfile(patch);
      if (typeof response.product_tour_completed === "boolean") {
        setCompleted(response.product_tour_completed);
        completedRef.current = response.product_tour_completed;
      }
      if (isProductTourStep(response.product_tour_step)) {
        setStepState(response.product_tour_step);
        stepRef.current = response.product_tour_step;
      }
    },
    [core],
  );

  const setStep = useCallback(
    async (next: ProductTourStep) => {
      if (completedRef.current || stepRef.current === next) {
        setStepState(next);
        return;
      }
      setStepState(next);
      stepRef.current = next;
      try {
        await patchTour({ product_tour_step: next });
      } catch {
        /* keep optimistic step; retry on next navigation */
      }
    },
    [patchTour],
  );

  const complete = useCallback(async () => {
    if (completedRef.current) {
      return;
    }
    setCompleted(true);
    completedRef.current = true;
    try {
      await patchTour({ product_tour_completed: true, product_tour_step: stepRef.current });
    } catch {
      /* optimistic complete; server retry on later session if still false */
    }
  }, [patchTour]);

  const skip = useCallback(async () => {
    await complete();
  }, [complete]);

  const value = useMemo(
    () => ({
      ready,
      completed,
      step,
      setStep,
      complete,
      skip,
    }),
    [ready, completed, step, setStep, complete, skip],
  );

  return <ProductTourContext.Provider value={value}>{children}</ProductTourContext.Provider>;
}

export function useProductTour(): ProductTourContextValue {
  const ctx = useContext(ProductTourContext);
  if (ctx == null) {
    throw new Error("useProductTour must be used within ProductTourProvider");
  }
  return ctx;
}
