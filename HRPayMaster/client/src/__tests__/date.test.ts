import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { toLocalYMD } from "@/lib/date";

describe("toLocalYMD", () => {
  const originalTZ = process.env.TZ;

  beforeAll(() => {
    process.env.TZ = "America/New_York"; // UTC-5 in winter
  });

  afterAll(() => {
    process.env.TZ = originalTZ;
  });

  it("preserves local date near UTC midnight", () => {
    const d = new Date("2024-01-01T00:30:00Z"); // still Dec 31 locally
    expect(toLocalYMD(d)).toBe("2023-12-31");
  });

  it("keeps same day when not crossing date boundary", () => {
    const d = new Date("2024-01-01T05:00:00Z"); // midnight local
    expect(toLocalYMD(d)).toBe("2024-01-01");
  });
});
