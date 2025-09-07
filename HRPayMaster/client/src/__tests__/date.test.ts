import { describe, it, expect } from "vitest";
import { toLocalYMD } from "@/lib/date";

describe("toLocalYMD", () => {
  it("preserves local date near UTC midnight", () => {
    const originalTZ = process.env.TZ;
    process.env.TZ = "America/New_York"; // UTC-5 in winter
    const d = new Date("2024-01-01T00:30:00Z"); // still Dec 31 locally
    expect(toLocalYMD(d)).toBe("2023-12-31");
    process.env.TZ = originalTZ;
  });
});
