import { describe, it, expect } from "vitest";
import { hasRole } from "@/lib/rbac";

describe("RBAC authorization helper", () => {
  it("allows admin to perform any role action", () => {
    expect(hasRole("admin", ["admin"])).toBe(true);
    expect(hasRole("admin", ["safety_officer"])).toBe(true);
    expect(hasRole("admin", ["project_manager"])).toBe(true);
    expect(hasRole("admin", ["site_engineer"])).toBe(true);
    expect(hasRole("admin", ["viewer"])).toBe(true);
  });

  it("restricts safety officer from admin actions", () => {
    expect(hasRole("safety_officer", ["safety_officer"])).toBe(true);
    expect(hasRole("safety_officer", ["admin"])).toBe(false);
  });

  it("handles null and undefined roles gracefully", () => {
    expect(hasRole(null, ["admin"])).toBe(false);
    expect(hasRole(undefined, ["viewer"])).toBe(false);
  });
});
