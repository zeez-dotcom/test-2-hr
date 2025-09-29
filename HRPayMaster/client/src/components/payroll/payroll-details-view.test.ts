import { describe, expect, it } from "vitest";

import { getEmployeeNames, type PayrollEntryWithEmployee } from "./payroll-details-view";

const createEntry = (
  employeeOverrides?: Partial<NonNullable<PayrollEntryWithEmployee["employee"]>>,
) => {
  const employee = employeeOverrides
    ? ({
        id: "emp-1",
        firstName: "",
        ...employeeOverrides,
      } as PayrollEntryWithEmployee["employee"])
    : undefined;

  return {
    id: "entry-1",
    employeeId: "123",
    employee,
  } as unknown as PayrollEntryWithEmployee;
};

describe("getEmployeeNames", () => {
  it("combines first and last names for the English display and returns the Arabic name", () => {
    const entry = createEntry({
      firstName: "John",
      lastName: "Doe",
      arabicName: "\tجون دو ",
    });

    expect(getEmployeeNames(entry)).toEqual({
      englishName: "John Doe",
      arabicName: "جون دو",
    });
  });

  it("falls back to the nickname when English name parts are missing", () => {
    const entry = createEntry({
      nickname: " JD ",
      arabicName: "جون",
    });

    expect(getEmployeeNames(entry)).toEqual({
      englishName: "JD",
      arabicName: "جون",
    });
  });

  it("uses a generic identifier when the employee record is unavailable", () => {
    const entry = createEntry();

    expect(getEmployeeNames(entry)).toEqual({
      englishName: "Employee 123",
      arabicName: "",
    });
  });
});
