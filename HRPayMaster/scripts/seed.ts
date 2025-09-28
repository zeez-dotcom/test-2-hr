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
  genericDocuments,
  notifications,
  emailAlerts,
  employeeEvents,
  vacationRequests,
  attendance,
  sickLeaveTracking,
  loanPayments,
  templates,
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
    {
      employeeCode: `${SEED_TAG}-EMP-004`,
      firstName: 'Mona',
      lastName: 'Merchant',
      email: 'mona.merchant@example.com',
      phone: '+965-555-0123',
      position: 'Finance Manager',
      role: 'employee',
      departmentId: deptByName[`${SEED_TAG}-Finance`],
      companyId: acme.id,
      salary: '3800.00',
      additions: '220.00',
      workLocation: 'Remote',
      startDate: iso(new Date(today.getFullYear(), 1, 5)),
      status: 'active',
      nationality: 'KW',
      bankName: 'Gulf Bank',
      bankIban: 'KW11SEED0000000000004004',
      civilId: 'SEED-CIV-004',
      civilIdExpiryDate: daysFrom(180),
      passportNumber: 'SEED-PASS-004',
      passportExpiryDate: daysFrom(540),
      visaNumber: 'SEED-VISA-004',
      visaExpiryDate: daysFrom(365),
      standardWorkingDays: 24,
      profileImage: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA',
    },
    {
      employeeCode: `${SEED_TAG}-EMP-005`,
      firstName: 'Omar',
      lastName: 'Operations',
      email: 'omar.operations@example.com',
      phone: '+965-555-0456',
      position: 'Field Supervisor',
      role: 'employee',
      departmentId: deptByName[`${SEED_TAG}-Engineering`],
      companyId: acme.id,
      salary: '3100.00',
      additions: '120.00',
      workLocation: 'Field',
      startDate: iso(new Date(today.getFullYear(), 3, 20)),
      status: 'on_leave',
      nationality: 'IN',
      drivingLicenseNumber: 'SEED-DL-005',
      drivingLicenseIssueDate: iso(new Date(today.getFullYear() - 2, 4, 1)),
      drivingLicenseExpiryDate: daysFrom(30),
      civilId: 'SEED-CIV-005',
      civilIdExpiryDate: daysFrom(45),
      passportNumber: 'SEED-PASS-005',
      passportExpiryDate: daysFrom(400),
      visaNumber: 'SEED-VISA-005',
      visaExpiryDate: daysFrom(20),
      standardWorkingDays: 26,
      emergencyContact: 'Razia Operations',
      emergencyPhone: '+965-555-0987',
    },
    {
      employeeCode: `${SEED_TAG}-EMP-006`,
      firstName: 'Lina',
      lastName: 'Logistics',
      email: 'lina.logistics@example.com',
      phone: '+965-555-0789',
      position: 'Logistics Coordinator',
      role: 'employee',
      departmentId: deptByName[`${SEED_TAG}-Finance`],
      companyId: acme.id,
      salary: '2900.00',
      additions: '0.00',
      workLocation: 'Office',
      startDate: iso(new Date(today.getFullYear() - 1, 8, 1)),
      status: 'inactive',
      nationality: 'PH',
      civilId: 'SEED-CIV-006',
      civilIdExpiryDate: daysFrom(10),
      passportNumber: 'SEED-PASS-006',
      passportExpiryDate: daysFrom(60),
      visaNumber: 'SEED-VISA-006',
      visaExpiryDate: daysFrom(14),
      standardWorkingDays: 26,
      otherDocs: 'Former employee offboarding checklist complete.',
    },
  ];

  const insertedEmployees = await db.insert(employees).values(employeeRows).returning();
  const empByCode: Record<string, Employee> = Object.fromEntries(
    insertedEmployees.map(e => [e.employeeCode, e])
  );

  // Custom fields and values
  const [linkedInField, tshirtField, emergencyContactField] = await db
    .insert(employeeCustomFields)
    .values([
      { name: `${SEED_TAG}-LinkedIn` },
      { name: `${SEED_TAG}-TShirtSize` },
      { name: `${SEED_TAG}-EmergencyContact` },
    ])
    .returning();

  await db.insert(employeeCustomValues).values([
    { employeeId: empByCode[`${SEED_TAG}-EMP-001`].id, fieldId: linkedInField.id, value: 'https://linkedin.com/in/alice-admin' },
    { employeeId: empByCode[`${SEED_TAG}-EMP-002`].id, fieldId: tshirtField.id, value: 'M' },
    { employeeId: empByCode[`${SEED_TAG}-EMP-003`].id, fieldId: tshirtField.id, value: 'L' },
    { employeeId: empByCode[`${SEED_TAG}-EMP-004`].id, fieldId: linkedInField.id, value: 'https://linkedin.com/in/mona-merchant' },
    { employeeId: empByCode[`${SEED_TAG}-EMP-005`].id, fieldId: emergencyContactField.id, value: 'Razia Operations (+965-555-0987)' },
    { employeeId: empByCode[`${SEED_TAG}-EMP-006`].id, fieldId: emergencyContactField.id, value: 'Khalid Logistics (+965-555-0678)' },
  ]);

  // Attendance (last 5 days, 8 hours each)
  for (const emp of insertedEmployees) {
    const daysToSeed = emp.status === 'inactive' ? 0 : emp.status === 'on_leave' ? 2 : 5;
    for (let i = 1; i <= daysToSeed; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const checkIn = new Date(date);
      checkIn.setHours(9, 0, 0, 0);
      const checkOut = emp.status === 'on_leave' ? null : (() => {
        const out = new Date(date);
        out.setHours(17, 0, 0, 0);
        return out;
      })();
      await db.insert(attendance).values({
        employeeId: emp.id,
        date: iso(date),
        checkIn: checkIn,
        checkOut: checkOut,
        hours: emp.status === 'on_leave' ? '0.00' : '8.00',
        source: emp.status === 'on_leave' ? 'leave' : 'manual',
        notes: emp.status === 'on_leave' ? 'Annual leave day' : undefined,
      });
    }
  }

  // Payroll run and entries
  const periodLabel = `${SEED_TAG}-${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const runStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const runEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);

  const computePayrollEntry = (emp: Employee, variant: 'current' | 'previous') => {
    const baseSalary = Number(emp.salary);
    const additions = Number(emp.additions ?? 0);
    const workingDays = emp.status === 'inactive' ? 0 : 26;
    let actualWorkingDays = workingDays;
    let vacationDays = 0;

    if (emp.status === 'on_leave') {
      vacationDays = variant === 'current' ? 4 : 8;
      actualWorkingDays = Math.max(workingDays - vacationDays, 0);
    } else if (emp.status === 'inactive') {
      actualWorkingDays = 0;
      vacationDays = workingDays;
    }

    const effectiveWorkingDays = workingDays === 0 ? 1 : workingDays;
    const proratedBase = variant === 'current' || emp.status === 'active'
      ? baseSalary
      : parseFloat((baseSalary * (actualWorkingDays / effectiveWorkingDays)).toFixed(2));
    const effectiveBase = emp.status === 'inactive' ? 0 : proratedBase;

    const bonus = variant === 'current'
      ? (emp.role === 'employee' ? 200 : emp.role === 'hr' ? 100 : 300)
      : (emp.role === 'employee' ? 150 : emp.role === 'hr' ? 80 : 220);

    const leaveAdjustment = variant === 'current' && emp.status === 'on_leave' ? 20 : 0;
    const gross = effectiveBase + bonus + additions;
    const tax = parseFloat((effectiveBase * 0.02).toFixed(2));
    const loanDeduction = emp.employeeCode === `${SEED_TAG}-EMP-003`
      ? 50
      : emp.employeeCode === `${SEED_TAG}-EMP-004`
        ? 100
        : 0;
    const otherDeductions = leaveAdjustment;
    const net = gross - (tax + loanDeduction + otherDeductions);

    return {
      employeeId: emp.id,
      grossPay: gross.toFixed(2),
      baseSalary: effectiveBase.toFixed(2),
      bonusAmount: bonus.toFixed(2),
      workingDays,
      actualWorkingDays,
      vacationDays,
      taxDeduction: tax.toFixed(2),
      socialSecurityDeduction: '0.00',
      healthInsuranceDeduction: '0.00',
      loanDeduction: loanDeduction.toFixed(2),
      otherDeductions: otherDeductions.toFixed(2),
      netPay: net.toFixed(2),
      adjustmentReason: variant === 'current' ? 'SEED payroll' : 'SEED prior payroll',
    };
  };

  const currentEntries = insertedEmployees.map(emp => computePayrollEntry(emp, 'current'));

  const grossSum = currentEntries.reduce((acc, e) => acc + Number(e.grossPay), 0);
  const dedSum = currentEntries.reduce((acc, e) => acc + Number(e.taxDeduction) + Number(e.loanDeduction) + Number(e.otherDeductions), 0);
  const netSum = currentEntries.reduce((acc, e) => acc + Number(e.netPay), 0);

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
    currentEntries.map(e => ({ ...e, payrollRunId: run.id }))
  );

  // Loans and payments
  const [eveLoan] = await db.insert(loans).values({
    employeeId: empByCode[`${SEED_TAG}-EMP-003`].id,
    amount: '1000.00',
    remainingAmount: '850.00',
    monthlyDeduction: '50.00',
    interestRate: '0.00',
    startDate: iso(new Date(today.getFullYear(), today.getMonth(), 1)),
    status: 'active',
    reason: 'SEED Laptop purchase',
    approvedBy: empByCode[`${SEED_TAG}-EMP-001`].id,
  }).returning();

  const [monaLoan] = await db.insert(loans).values({
    employeeId: empByCode[`${SEED_TAG}-EMP-004`].id,
    amount: '2500.00',
    remainingAmount: '0.00',
    monthlyDeduction: '100.00',
    interestRate: '1.50',
    startDate: iso(new Date(today.getFullYear(), today.getMonth() - 6, 1)),
    endDate: iso(new Date(today.getFullYear(), today.getMonth(), 1)),
    status: 'completed',
    reason: 'SEED MBA stipend',
    approvedBy: empByCode[`${SEED_TAG}-EMP-001`].id,
  }).returning();

  await db.insert(loanPayments).values([
    {
      loanId: eveLoan.id,
      payrollRunId: run.id,
      employeeId: eveLoan.employeeId,
      amount: '50.00',
      appliedDate: iso(runEnd),
      source: 'payroll',
    },
    {
      loanId: monaLoan.id,
      payrollRunId: run.id,
      employeeId: monaLoan.employeeId,
      amount: '100.00',
      appliedDate: iso(runEnd),
      source: 'payroll',
    },
  ]);

  // Prior month payroll for reporting history
  const prevStart = new Date(runStart);
  prevStart.setMonth(prevStart.getMonth() - 1);
  const prevEnd = new Date(prevStart.getFullYear(), prevStart.getMonth() + 1, 0);
  const prevLabel = `${SEED_TAG}-${prevStart.getFullYear()}-${String(prevStart.getMonth() + 1).padStart(2, '0')}`;
  const previousEntries = insertedEmployees.map(emp => computePayrollEntry(emp, 'previous'));

  const prevGross = previousEntries.reduce((sum, entry) => sum + Number(entry.grossPay), 0);
  const prevDed = previousEntries.reduce((sum, entry) => sum + Number(entry.taxDeduction) + Number(entry.loanDeduction) + Number(entry.otherDeductions), 0);
  const prevNet = previousEntries.reduce((sum, entry) => sum + Number(entry.netPay), 0);

  const [previousRun] = await db
    .insert(payrollRuns)
    .values({
      period: prevLabel,
      startDate: iso(prevStart),
      endDate: iso(prevEnd),
      grossAmount: prevGross.toFixed(2),
      totalDeductions: prevDed.toFixed(2),
      netAmount: prevNet.toFixed(2),
      status: 'completed',
    })
    .returning();

  await db.insert(payrollEntries).values(
    previousEntries.map(e => ({ ...e, payrollRunId: previousRun.id }))
  );

  await db.insert(loanPayments).values([
    {
      loanId: eveLoan.id,
      payrollRunId: previousRun.id,
      employeeId: eveLoan.employeeId,
      amount: '50.00',
      appliedDate: iso(prevEnd),
      source: 'payroll',
    },
    {
      loanId: monaLoan.id,
      payrollRunId: previousRun.id,
      employeeId: monaLoan.employeeId,
      amount: '100.00',
      appliedDate: iso(prevEnd),
      source: 'payroll',
    },
  ]);

  // Assets and assignments
  const [laptop, phone, monitor] = await db
    .insert(assets)
    .values([
      { type: 'IT', name: `${SEED_TAG}-Laptop`, status: 'assigned', details: 'MacBook Pro 14', },
      { type: 'IT', name: `${SEED_TAG}-Phone`, status: 'assigned', details: 'iPhone 14', },
      { type: 'IT', name: `${SEED_TAG}-Monitor`, status: 'available', details: 'Dell UltraSharp 27"', },
    ])
    .returning();

  await db.insert(assetAssignments).values([
    { assetId: laptop.id, employeeId: empByCode[`${SEED_TAG}-EMP-003`].id, assignedDate: iso(new Date()), status: 'active', assignedBy: empByCode[`${SEED_TAG}-EMP-001`].id, notes: 'SEED assignment' },
    { assetId: phone.id, employeeId: empByCode[`${SEED_TAG}-EMP-002`].id, assignedDate: iso(new Date()), status: 'active', assignedBy: empByCode[`${SEED_TAG}-EMP-001`].id, notes: 'SEED assignment' },
    { assetId: monitor.id, employeeId: empByCode[`${SEED_TAG}-EMP-004`].id, assignedDate: iso(new Date(today.getFullYear(), today.getMonth(), 1)), status: 'completed', returnDate: iso(new Date(today.getFullYear(), today.getMonth(), 10)), assignedBy: empByCode[`${SEED_TAG}-EMP-001`].id, notes: 'Returned after remote assignment' },
  ]);

  await db.insert(assetDocuments).values([
    { assetId: laptop.id, title: 'SEED Laptop Invoice', description: 'Demo invoice', documentUrl: 'https://example.com/invoice.pdf' },
    { assetId: monitor.id, title: 'SEED Monitor Warranty', description: 'Warranty receipt', documentUrl: 'https://example.com/warranty.pdf' },
  ]);

  await db.insert(assetRepairs).values([
    { assetId: laptop.id, repairDate: iso(new Date()), description: 'SEED keyboard fix', cost: '50.00', vendor: 'DemoVendor', documentUrl: 'https://example.com/repair.pdf' },
    { assetId: phone.id, repairDate: iso(new Date(today.getFullYear(), today.getMonth() - 1, 12)), description: 'SEED screen protector replacement', cost: '20.00', vendor: 'DemoVendor', documentUrl: 'https://example.com/phone-repair.pdf' },
  ]);

  // Cars and assignments
  const [car, spareVan] = await db
    .insert(cars)
    .values([
      {
        make: 'Toyota',
        model: 'Corolla',
        year: 2022,
        plateNumber: `${SEED_TAG}-ABC-123`,
        status: 'assigned',
        mileage: 12345,
        insuranceExpiry: daysFrom(90),
        registrationExpiry: daysFrom(120),
        carImage: '',
      },
      {
        make: 'Nissan',
        model: 'Urvan',
        year: 2021,
        plateNumber: `${SEED_TAG}-VAN-321`,
        status: 'maintenance',
        mileage: 45210,
        insuranceExpiry: daysFrom(60),
        registrationExpiry: daysFrom(80),
        carImage: '',
      },
    ])
    .returning();

  await db.insert(carAssignments).values({
    carId: car.id,
    employeeId: empByCode[`${SEED_TAG}-EMP-002`].id,
    assignedDate: iso(new Date()),
    status: 'active',
    assignedBy: empByCode[`${SEED_TAG}-EMP-001`].id,
    notes: 'SEED car assignment',
  });

  await db.insert(carAssignments).values({
    carId: spareVan.id,
    employeeId: empByCode[`${SEED_TAG}-EMP-005`].id,
    assignedDate: iso(new Date(today.getFullYear(), today.getMonth() - 2, 5)),
    returnDate: iso(new Date(today.getFullYear(), today.getMonth() - 1, 28)),
    status: 'completed',
    assignedBy: empByCode[`${SEED_TAG}-EMP-001`].id,
    notes: 'Seasonal field support',
  });

  await db.insert(carRepairs).values({
    carId: car.id,
    repairDate: iso(new Date()),
    description: 'SEED tire change',
    cost: '80.00',
    vendor: 'DemoGarage',
    documentUrl: 'https://example.com/tire.pdf',
  });

  await db.insert(carRepairs).values({
    carId: spareVan.id,
    repairDate: iso(new Date(today.getFullYear(), today.getMonth() - 1, 15)),
    description: 'SEED brake pad replacement',
    cost: '120.00',
    vendor: 'FleetCare',
    documentUrl: 'https://example.com/brake.pdf',
  });

  // Vacation requests
  await db.insert(employeeEvents).values([
    { employeeId: empByCode[`${SEED_TAG}-EMP-003`].id, eventType: 'bonus', title: 'SEED Performance Bonus', description: 'Great work on release', amount: '200.00', eventDate: iso(new Date()), affectsPayroll: true, addedBy: empByCode[`${SEED_TAG}-EMP-001`].id },
    { employeeId: empByCode[`${SEED_TAG}-EMP-004`].id, eventType: 'deduction', title: 'SEED Late Expense Submission', description: 'Expense report submitted late', amount: '25.00', eventDate: iso(new Date(today.getFullYear(), today.getMonth(), 5)), affectsPayroll: true, addedBy: empByCode[`${SEED_TAG}-EMP-001`].id },
    { employeeId: empByCode[`${SEED_TAG}-EMP-005`].id, eventType: 'vacation', title: 'SEED Annual Leave', description: 'Approved annual leave block', amount: '0.00', eventDate: iso(new Date(today.getFullYear(), today.getMonth(), 2)), affectsPayroll: false, addedBy: empByCode[`${SEED_TAG}-EMP-002`].id },
    { employeeId: empByCode[`${SEED_TAG}-EMP-002`].id, eventType: 'allowance', title: 'SEED Communication Allowance', description: 'Monthly phone stipend', amount: '30.00', eventDate: iso(new Date(today.getFullYear(), today.getMonth(), 1)), affectsPayroll: true, addedBy: empByCode[`${SEED_TAG}-EMP-001`].id },
  ]);

  await db.insert(vacationRequests).values([
    {
      employeeId: empByCode[`${SEED_TAG}-EMP-005`].id,
      startDate: iso(new Date(today.getFullYear(), today.getMonth(), 1)),
      endDate: iso(new Date(today.getFullYear(), today.getMonth(), 14)),
      days: 10,
      reason: 'Annual trip home',
      leaveType: 'annual',
      deductFromSalary: false,
      documentUrl: 'https://example.com/leave-approval.pdf',
      status: 'approved',
      approvedBy: empByCode[`${SEED_TAG}-EMP-001`].id,
    },
    {
      employeeId: empByCode[`${SEED_TAG}-EMP-003`].id,
      startDate: iso(new Date(today.getFullYear(), today.getMonth() + 1, 5)),
      endDate: iso(new Date(today.getFullYear(), today.getMonth() + 1, 7)),
      days: 3,
      reason: 'Family event',
      leaveType: 'emergency',
      deductFromSalary: false,
      status: 'pending',
    },
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

  const [notif2] = await db.insert(notifications).values({
    employeeId: empByCode[`${SEED_TAG}-EMP-005`].id,
    type: 'vacation_approved',
    title: 'SEED Leave Approved',
    message: 'Your annual leave has been approved.',
    priority: 'medium',
    status: 'unread',
    expiryDate: iso(new Date(today.getFullYear(), today.getMonth(), 30)),
    daysUntilExpiry: 30,
    emailSent: true,
    documentUrl: 'https://example.com/leave-approval.pdf',
  }).returning();

  await db.insert(emailAlerts).values({
    employeeId: empByCode[`${SEED_TAG}-EMP-005`].id,
    notificationId: notif2.id,
    emailType: 'vacation_notice',
    subject: 'Leave Approved',
    body: 'Enjoy your time off!',
    recipient: 'omar.operations@example.com',
    status: 'sent',
    sentAt: new Date(),
  });

  await db.insert(genericDocuments).values([
    {
      employeeId: empByCode[`${SEED_TAG}-EMP-002`].id,
      title: `${SEED_TAG} - Employment Contract`,
      description: 'Signed contract for HR Specialist role.',
      documentUrl: 'https://example.com/seed-contract.pdf',
      category: 'contract',
      tags: 'contract,hr',
      referenceNumber: `${SEED_TAG}-CN-2024-001`,
      controllerNumber: `${SEED_TAG}-DOC-0001`,
      expiryDate: iso(new Date(today.getFullYear() + 1, 0, 1)),
      alertDays: 30,
    },
    {
      employeeId: empByCode[`${SEED_TAG}-EMP-004`].id,
      title: `${SEED_TAG} - Promotion Letter`,
      description: 'Finance manager promotion confirmation.',
      documentUrl: 'https://example.com/seed-promotion.pdf',
      category: 'letter',
      tags: 'promotion,finance',
      referenceNumber: `${SEED_TAG}-PR-2024-002`,
      controllerNumber: `${SEED_TAG}-DOC-0002`,
      alertDays: 0,
    },
  ]);

  // Sick leave tracking
  for (const emp of insertedEmployees) {
    const used = emp.employeeCode === `${SEED_TAG}-EMP-005` ? 3 : emp.employeeCode === `${SEED_TAG}-EMP-002` ? 1 : 0;
    await db.insert(sickLeaveTracking).values({
      employeeId: emp.id,
      year: today.getFullYear(),
      totalSickDaysUsed: used,
      remainingSickDays: Math.max(14 - used, 0),
    });
  }

  await db
    .insert(templates)
    .values([
      {
        key: `${SEED_TAG}-noc`,
        en: 'Seed NOC template for demonstration.',
        ar: 'Seed NOC Arabic placeholder.',
      },
      {
        key: `${SEED_TAG}-warning`,
        en: 'Seed warning template body.',
        ar: 'Seed warning Arabic placeholder.',
      },
    ]);

  console.log('Seed complete.');
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
