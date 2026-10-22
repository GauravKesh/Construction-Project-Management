import { describe, it, expect } from "vitest";

function evaluatePredicate(operator: string, value: number, threshold: number): boolean {
  switch (operator) {
    case ">":
      return value > threshold;
    case ">=":
      return value >= threshold;
    case "<":
      return value < threshold;
    case "<=":
      return value <= threshold;
    case "==":
      return value === threshold;
    default:
      return false;
  }
}

describe("Rules evaluation predicates", () => {
  it("evaluates greater-than condition correctly", () => {
    expect(evaluatePredicate(">", 72, 65)).toBe(true);
    expect(evaluatePredicate(">", 60, 65)).toBe(false);
  });

  it("evaluates less-than condition correctly", () => {
    expect(evaluatePredicate("<", 40, 50)).toBe(true);
    expect(evaluatePredicate("<", 55, 50)).toBe(false);
  });
});
