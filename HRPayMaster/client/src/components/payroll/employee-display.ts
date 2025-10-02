interface EmployeeRecord {
  employeeId: string | number;
  employee?: {
    firstName?: string | null;
    lastName?: string | null;
    nickname?: string | null;
    arabicName?: string | null;
    employeeCode?: string | number | null;
    name?: string | null;
  } | null;
}

export function getEmployeeDisplayDetails(entry: EmployeeRecord) {
  const fallbackName = `Employee ${entry.employeeId}`;
  const firstName = entry.employee?.firstName?.trim();
  const lastName = entry.employee?.lastName?.trim();
  const nickname = entry.employee?.nickname?.trim();
  const nameParts = [firstName, lastName].filter(Boolean) as string[];

  let englishName = fallbackName;

  if (nickname && nameParts.length > 0) {
    englishName = `${nickname} (${nameParts.join(" ")})`;
  } else if (nickname) {
    englishName = nickname;
  } else if (nameParts.length > 0) {
    englishName = nameParts.join(" ");
  } else if (entry.employee?.name?.trim()) {
    englishName = entry.employee.name.trim();
  }

  const arabicName = entry.employee?.arabicName?.trim() || null;
  const employeeCode = entry.employee?.employeeCode;
  const codeValue =
    employeeCode !== undefined && employeeCode !== null && `${employeeCode}`.trim() !== ""
      ? `${employeeCode}`.trim()
      : `${entry.employeeId}`;

  return {
    englishName,
    arabicName,
    code: codeValue,
  };
}
