import 'dotenv/config';
import { db } from '../server/db';
import {
  departments,
  companies,
  employees,
  employeeCustomFields,
  employeeCustomValues,
  payrollRuns,
  payrollEntries,
  loans,
  assets,
  assetAssignments,
  assetDocuments,
  assetRepairs,
  cars,
  carAssignments,
  carRepairs,
  notifications,
  emailAlerts,
  employeeEvents,
  attendance,
  sickLeaveTracking,
  type Employee,
} from '@shared/schema';
import { and, eq, inArray, sql } from 'drizzle-orm';

const SEED_TAG = 'SEED';

async function alreadySeeded() {
  const existing = await db
    .select({ id: departments.id })
    .from(departments)
    .where(eq(departments.name, `${SEED_TAG}-HR`));
  return existing.length > 0;
}

async function main() {
  if (await alreadySeeded()) {
    console.log('Seed data already present. Skipping. Run npm run db:unseed to remove.');
    return;
  }

  // Companies
  const [acme] = await db
    .insert(companies)
    .values([
      { name: `${SEED_TAG}-ACME`, logo: null },
      { name: `${SEED_TAG}-Globex`, logo: null },
    ])
    .returning();

  // Departments
  const insertedDepts = await db
    .insert(departments)
    .values([
      { name: `${SEED_TAG}-HR`, description: 'Human Resources' },
      { name: `${SEED_TAG}-Engineering`, description: 'Engineering' },
      { name: `${SEED_TAG}-Finance`, description: 'Finance' },
    ])
    .returning();

  const deptByName = Object.fromEntries(insertedDepts.map(d => [d.name, d.id]));

  // Employees
  const today = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const daysFrom = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return iso(d);
  };

  const employeeRows = [
    {
      employeeCode: `${SEED_TAG}-EMP-001`,
      firstName: 'Alice',
      lastName: 'Admin',
      email: 'alice.admin@example.com',
      phone: '+1-202-555-0101',
      position: 'Head of HR',
      role: 'admin',
      departmentId: deptByName[`${SEED_TAG}-HR`],
      companyId: acme.id,
      salary: '5000.00',
      additions: '250.00',
      workLocation: 'Office',
      startDate: iso(new Date(today.getFullYear(), 0, 15)),
      status: 'active',
      nationality: 'US',
      civilId: 'SEED-CIV-001',
      civilIdExpiryDate: daysFrom(20),
      passportNumber: 'SEED-PASS-001',
      passportExpiryDate: daysFrom(25),
      visaNumber: 'SEED-VISA-001',
      visaExpiryDate: daysFrom(40),
      standardWorkingDays: 26,
    },
    {
      employeeCode: `${SEED_TAG}-EMP-002`,
      firstName: 'Henry',
      lastName: 'HR',
      email: 'henry.hr@example.com',
      phone: '+1-202-555-0102',
      position: 'HR Specialist',
      role: 'hr',
      departmentId: deptByName[`${SEED_TAG}-HR`],
      companyId: acme.id,
      salary: '3500.00',
      additions: '150.00',
      workLocation: 'Office',
      startDate: iso(new Date(today.getFullYear(), 2, 1)),
      status: 'active',
      nationality: 'US',
      civilId: 'SEED-CIV-002',
      civilIdExpiryDate: daysFrom(60),
      passportNumber: 'SEED-PASS-002',
      passportExpiryDate: daysFrom(120),
      visaNumber: 'SEED-VISA-002',
      visaExpiryDate: daysFrom(15),
      standardWorkingDays: 26,
    },
    {
      employeeCode: `${SEED_TAG}-EMP-003`,
      firstName: 'Eve',
      lastName: 'Engineer',
      email: 'eve.engineer@example.com',
      phone: '+1-202-555-0103',
      position: 'Software Engineer',
      role: 'employee',
      departmentId: deptByName[`${SEED_TAG}-Engineering`],
      companyId: acme.id,
      salary: '4200.00',
      additions: '0.00',
      workLocation: 'Hybrid',
      startDate: iso(new Date(today.getFullYear(), 5, 10)),
      status: 'active',
      nationality: 'US',
      civilId: 'SEED-CIV-003',
      civilIdExpiryDate: daysFrom(5),
      passportNumber: 'SEED-PASS-003',
      passportExpiryDate: daysFrom(365),
      visaNumber: 'SEED-VISA-003',
      visaExpiryDate: daysFrom(7),
      standardWorkingDays: 26,
    },
  ];

  const insertedEmployees = await db.insert(employees).values(employeeRows).returning();
  const empByCode: Record<string, Employee> = Object.fromEntries(
    insertedEmployees.map(e => [e.employeeCode, e])
  );

  // Custom fields and values
  const [linkedInField, tshirtField] = await db
    .insert(employeeCustomFields)
    .values([
      { name: `${SEED_TAG}-LinkedIn` },
      { name: `${SEED_TAG}-TShirtSize` },
    ])
    .returning();

  await db.insert(employeeCustomValues).values([
    { employeeId: empByCode[`${SEED_TAG}-EMP-001`].id, fieldId: linkedInField.id, value: 'https://linkedin.com/in/alice-admin' },
    { employeeId: empByCode[`${SEED_TAG}-EMP-002`].id, fieldId: tshirtField.id, value: 'M' },
    { employeeId: empByCode[`${SEED_TAG}-EMP-003`].id, fieldId: tshirtField.id, value: 'L' },
  ]);

  // Attendance (last 5 days, 8 hours each)
  for (const emp of insertedEmployees) {
    for (let i = 1; i <= 5; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const checkIn = new Date(date);
      checkIn.setHours(9, 0, 0, 0);
      const checkOut = new Date(date);
      checkOut.setHours(17, 0, 0, 0);
      await db.insert(attendance).values({
        employeeId: emp.id,
        date: iso(date),
        checkIn: checkIn,
        checkOut: checkOut,
        hours: '8.00',
        source: 'manual',
      });
    }
  }

  // Payroll run and entries
  const periodLabel = `${SEED_TAG}-${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const runStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const runEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);

  // entries per employee
  const entries = insertedEmployees.map(emp => {
    const base = Number(emp.salary);
    const bonus = emp.role === 'employee' ? 200 : emp.role === 'hr' ? 100 : 300;
    const loanDeduction = emp.employeeCode === `${SEED_TAG}-EMP-003` ? 50 : 0;
    const tax = Math.round(base * 0.02 * 100) / 100;
    const other = 0;
    const gross = base + bonus;
    const deductions = tax + loanDeduction + other;
    const net = gross - deductions;
    return {
      employeeId: emp.id,
      grossPay: gross.toFixed(2),
      baseSalary: base.toFixed(2),
      bonusAmount: bonus.toFixed(2),
      workingDays: 26,
      actualWorkingDays: 26,
      vacationDays: 0,
      taxDeduction: tax.toFixed(2),
      socialSecurityDeduction: '0.00',
      healthInsuranceDeduction: '0.00',
      loanDeduction: loanDeduction.toFixed(2),
      otherDeductions: other.toFixed(2),
      netPay: net.toFixed(2),
      adjustmentReason: 'SEED payroll',
    };
  });

  const grossSum = entries.reduce((acc, e) => acc + Number(e.grossPay), 0);
  const dedSum = entries.reduce((acc, e) => acc + Number(e.taxDeduction) + Number(e.loanDeduction) + Number(e.otherDeductions), 0);
  const netSum = entries.reduce((acc, e) => acc + Number(e.netPay), 0);

  const [run] = await db
    .insert(payrollRuns)
    .values({
      period: periodLabel,
      startDate: iso(runStart),
      endDate: iso(runEnd),
      grossAmount: grossSum.toFixed(2),
      totalDeductions: dedSum.toFixed(2),
      netAmount: netSum.toFixed(2),
      status: 'completed',
    })
    .returning();

  await db.insert(payrollEntries).values(
    entries.map(e => ({ ...e, payrollRunId: run.id }))
  );

  // Loan for Eve (EMP-003)
  await db.insert(loans).values({
    employeeId: empByCode[`${SEED_TAG}-EMP-003`].id,
    amount: '1000.00',
    remainingAmount: '850.00',
    monthlyDeduction: '50.00',
    interestRate: '0.00',
    startDate: iso(new Date(today.getFullYear(), today.getMonth(), 1)),
    status: 'active',
    reason: 'SEED Laptop purchase',
    approvedBy: empByCode[`${SEED_TAG}-EMP-001`].id,
  });

  // Assets and assignments
  const [laptop, phone] = await db
    .insert(assets)
    .values([
      { type: 'IT', name: `${SEED_TAG}-Laptop`, status: 'assigned', details: 'MacBook Pro 14', },
      { type: 'IT', name: `${SEED_TAG}-Phone`, status: 'assigned', details: 'iPhone 14', },
    ])
    .returning();

  await db.insert(assetAssignments).values([
    { assetId: laptop.id, employeeId: empByCode[`${SEED_TAG}-EMP-003`].id, assignedDate: iso(new Date()), status: 'active', assignedBy: empByCode[`${SEED_TAG}-EMP-001`].id, notes: 'SEED assignment' },
    { assetId: phone.id, employeeId: empByCode[`${SEED_TAG}-EMP-002`].id, assignedDate: iso(new Date()), status: 'active', assignedBy: empByCode[`${SEED_TAG}-EMP-001`].id, notes: 'SEED assignment' },
  ]);

  await db.insert(assetDocuments).values([
    { assetId: laptop.id, title: 'SEED Laptop Invoice', description: 'Demo invoice', documentUrl: 'https://example.com/invoice.pdf' },
  ]);

  await db.insert(assetRepairs).values([
    { assetId: laptop.id, repairDate: iso(new Date()), description: 'SEED keyboard fix', cost: '50.00', vendor: 'DemoVendor', documentUrl: 'https://example.com/repair.pdf' },
  ]);

  // Cars and assignments
  const [car] = await db
    .insert(cars)
    .values({
      make: 'Toyota',
      model: 'Corolla',
      year: 2022,
      plateNumber: `${SEED_TAG}-ABC-123`,
      status: 'assigned',
      mileage: 12345,
      insuranceExpiry: daysFrom(90),
      registrationExpiry: daysFrom(120),
      carImage: '',
    })
    .returning();

  await db.insert(carAssignments).values({
    carId: car.id,
    employeeId: empByCode[`${SEED_TAG}-EMP-002`].id,
    assignedDate: iso(new Date()),
    status: 'active',
    assignedBy: empByCode[`${SEED_TAG}-EMP-001`].id,
    notes: 'SEED car assignment',
  });

  await db.insert(carRepairs).values({
    carId: car.id,
    repairDate: iso(new Date()),
    description: 'SEED tire change',
    cost: '80.00',
    vendor: 'DemoGarage',
    documentUrl: 'https://example.com/tire.pdf',
  });

  // Vacation requests
  await db.insert(employeeEvents).values([
    { employeeId: empByCode[`${SEED_TAG}-EMP-003`].id, eventType: 'bonus', title: 'SEED Performance Bonus', description: 'Great work on release', amount: '200.00', eventDate: iso(new Date()), affectsPayroll: true, addedBy: empByCode[`${SEED_TAG}-EMP-001`].id },
  ]);

  // Notifications and email alerts (expiry warnings)
  const [notif1] = await db.insert(notifications).values({
    employeeId: empByCode[`${SEED_TAG}-EMP-003`].id,
    type: 'visa_expiry',
    title: 'SEED Visa Expiry Warning',
    message: 'Visa expires soon',
    priority: 'high',
    status: 'unread',
    expiryDate: daysFrom(7),
    daysUntilExpiry: 7,
    emailSent: false,
  }).returning();

  await db.insert(emailAlerts).values({
    employeeId: empByCode[`${SEED_TAG}-EMP-003`].id,
    notificationId: notif1.id,
    emailType: 'expiry_warning',
    subject: 'SEED Visa Expiry',
    body: 'Demo email body',
    recipient: 'eve.engineer@example.com',
    status: 'pending',
  });

  // Sick leave tracking
  for (const emp of insertedEmployees) {
    await db.insert(sickLeaveTracking).values({
      employeeId: emp.id,
      year: today.getFullYear(),
      totalSickDaysUsed: 0,
      remainingSickDays: 14,
    });
  }

  console.log('Seed complete.');
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
