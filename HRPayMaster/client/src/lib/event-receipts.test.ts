import { describe, expect, it } from "vitest";

import type { EmployeeEvent } from "@shared/schema";

import { buildEventNarrative } from "./event-receipts";

describe("buildEventNarrative", () => {
  it("produces Arabic content distinct from English", () => {
    const event = {
      id: "evt-1",
      employeeId: "emp-1",
      eventType: "bonus",
      title: "Annual Bonus",
      description: "Awarded for outstanding performance",
      amount: "1500.000",
      eventDate: new Date("2024-05-01"),
      affectsPayroll: true,
      documentUrl: null,
      status: "active",
      addedBy: null,
      createdAt: new Date("2024-05-02"),
    } satisfies EmployeeEvent;

    const narrative = buildEventNarrative(event, {
      en: "John Doe (Phone: 555-0100)",
      ar: "جون دو (الهاتف: ٥٥٥-٠١٠٠)",
    });

    expect(narrative.title.ar).not.toEqual(narrative.title.en);
    expect(narrative.title.ar).toMatch(/[\u0600-\u06FF]/);

    expect(narrative.body.ar).not.toEqual(narrative.body.en);
    expect(narrative.body.ar).toMatch(/[\u0600-\u06FF]/);

    expect(narrative.details.ar).not.toEqual(narrative.details.en);
    expect(narrative.details.ar.join(" ")).toMatch(/[\u0600-\u06FF]/);
  });
});
