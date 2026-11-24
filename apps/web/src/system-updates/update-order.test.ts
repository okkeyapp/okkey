import { describe, expect, it } from "vitest";

import { planComponentUpdateOrder } from "./update-order";

const core = {
  component: "okkey" as const,
  toVersion: "2.0.0",
  minCoreVersion: null,
};
const enterprise = {
  component: "enterprise" as const,
  toVersion: "3.0.0",
  minCoreVersion: "2.0.0",
};

describe("planComponentUpdateOrder", () => {
  it("updates core before enterprise", () => {
    const plan = planComponentUpdateOrder([enterprise, { ...core, minCoreVersion: null }], "2.0.0");
    expect(plan.notice).toBeNull();
    expect(plan.order.map((update) => update.component)).toEqual(["okkey", "enterprise"]);
  });

  it("puts core first when enterprise needs that core version", () => {
    const plan = planComponentUpdateOrder([enterprise, core], "1.0.0");
    expect(plan.notice).toEqual({ minCoreVersion: "2.0.0", satisfiedBy: "2.0.0" });
    expect(plan.order.map((update) => update.component)).toEqual(["okkey", "enterprise"]);
  });

  it("leaves enterprise out when the available core is still too old", () => {
    const plan = planComponentUpdateOrder(
      [enterprise, { ...core, toVersion: "1.5.0" }],
      "1.0.0",
    );
    expect(plan.notice).toEqual({ minCoreVersion: "2.0.0", satisfiedBy: null });
    expect(plan.order.map((update) => update.component)).toEqual(["okkey"]);
  });

  it("does not update enterprise alone when the installed core is too old", () => {
    const plan = planComponentUpdateOrder([enterprise], "1.0.0");
    expect(plan.order).toEqual([]);
    expect(plan.notice?.satisfiedBy).toBeNull();
  });
});
