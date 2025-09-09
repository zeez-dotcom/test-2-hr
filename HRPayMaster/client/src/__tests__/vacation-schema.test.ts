import { describe, it, expect } from "vitest";
import { z } from "zod";

// replicate schema from vacations page
const vacationSchema = z
  .object({
    employeeId: z.string().min(1),
    start: z.string(),
    end: z.string(),
    leaveType: z.enum(["vacation", "sick", "personal", "other"]),
    reason: z.string().optional(),
  })
  .refine(({ end, start }) => new Date(end) >= new Date(start), {
    message: "End date must be on or after start date",
    path: ["end"],
  });

describe("vacation schema", () => {
  it("rejects end date before start date", () => {
    const result = vacationSchema.safeParse({
      employeeId: "1",
      start: "2024-01-10",
      end: "2024-01-05",
      leaveType: "vacation",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["end"]);
    }
  });

  it("accepts valid vacation request", () => {
    const parsed = vacationSchema.parse({
      employeeId: "1",
      start: "2024-01-05",
      end: "2024-01-10",
      leaveType: "vacation",
    });
    expect(parsed.start).toBe("2024-01-05");
    expect(parsed.end).toBe("2024-01-10");
  });
});
