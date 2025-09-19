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
  vacationRequests,
  attendance,
  sickLeaveTracking,
} from '@shared/schema';
import { and, eq, inArray, like } from 'drizzle-orm';

const SEED_TAG = 'SEED';

async function main() {
  // Collect seeded employees
  const seededEmployees = await db
    .select({ id: employees.id })
    .from(employees)
    .where(like(employees.employeeCode, `${SEED_TAG}-%`));
  const empIds = seededEmployees.map(e => e.id);

  // If nothing to unseed, exit
  const hasAny = empIds.length > 0;

  // Delete dependent records referencing seeded employees
  if (hasAny) {
    await db.delete(emailAlerts).where(inArray(emailAlerts.employeeId, empIds));
    await db.delete(notifications).where(inArray(notifications.employeeId, empIds));
    await db.delete(employeeEvents).where(inArray(employeeEvents.employeeId, empIds));
    await db.delete(vacationRequests).where(inArray(vacationRequests.employeeId, empIds));
    await db.delete(loans).where(inArray(loans.employeeId, empIds));
    await db.delete(carAssignments).where(inArray(carAssignments.employeeId, empIds));
    await db.delete(assetAssignments).where(inArray(assetAssignments.employeeId, empIds));
    await db.delete(payrollEntries).where(inArray(payrollEntries.employeeId, empIds));
    await db.delete(attendance).where(inArray(attendance.employeeId, empIds));
    await db.delete(employeeCustomValues).where(inArray(employeeCustomValues.employeeId, empIds));
    await db.delete(sickLeaveTracking).where(inArray(sickLeaveTracking.employeeId, empIds));
  }

  // Assets and related
  const seededAssets = await db
    .select({ id: assets.id })
    .from(assets)
    .where(like(assets.name, `${SEED_TAG}-%`));
  const assetIds = seededAssets.map(a => a.id);
  if (assetIds.length) {
    await db.delete(assetRepairs).where(inArray(assetRepairs.assetId, assetIds));
    await db.delete(assetDocuments).where(inArray(assetDocuments.assetId, assetIds));
    await db.delete(assetAssignments).where(inArray(assetAssignments.assetId, assetIds));
    await db.delete(assets).where(inArray(assets.id, assetIds));
  }

  // Cars and related
  const seededCars = await db
    .select({ id: cars.id })
    .from(cars)
    .where(like(cars.plateNumber, `${SEED_TAG}-%`));
  const carIds = seededCars.map(c => c.id);
  if (carIds.length) {
    await db.delete(carRepairs).where(inArray(carRepairs.carId, carIds));
    await db.delete(carAssignments).where(inArray(carAssignments.carId, carIds));
    await db.delete(cars).where(inArray(cars.id, carIds));
  }

  // Payroll runs created by seed
  await db.delete(payrollRuns).where(like(payrollRuns.period, `${SEED_TAG}-%`));

  // Custom fields
  await db.delete(employeeCustomFields).where(like(employeeCustomFields.name, `${SEED_TAG}-%`));

  // Employees
  if (hasAny) {
    await db.delete(employees).where(inArray(employees.id, empIds));
  }

  // Departments and companies
  await db.delete(departments).where(like(departments.name, `${SEED_TAG}-%`));
  await db.delete(companies).where(like(companies.name, `${SEED_TAG}-%`));

  console.log('Unseed complete.');
}

main().catch((err) => {
  console.error('Unseed failed:', err);
  process.exit(1);
});
