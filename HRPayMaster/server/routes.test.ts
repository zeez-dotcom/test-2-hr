import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { errorHandler } from './errorHandler';
import * as XLSX from 'xlsx';

vi.mock('./storage', () => {
  class DuplicateEmployeeCodeError extends Error {}
  return {
    storage: {
      getEmployees: vi.fn(),
      createEmployee: vi.fn(),
      createEmployeesBulk: vi.fn(),
      updateEmployee: vi.fn(),
      getEmployeeCustomFields: vi.fn(),
      createEmployeeCustomField: vi.fn(),
      createEmployeeCustomValue: vi.fn(),
      getPayrollRuns: vi.fn(),
      getLoans: vi.fn(),
      getCars: vi.fn(),
      createCar: vi.fn(),
      updateCar: vi.fn(),
      createCarAssignment: vi.fn(),
      createEmployeeEvent: vi.fn(),
    },
    DuplicateEmployeeCodeError,
  };
});

import { registerRoutes } from './routes';
import { payrollRouter } from './routes/payroll';
import { loansRouter } from './routes/loans';
import { carsRouter } from './routes/cars';
import { storage } from './storage';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    // Stub authentication for tests
    // @ts-ignore
    req.isAuthenticated = () => true;
    next();
  });
  return app;
}

describe('employee routes', () => {
  let app: express.Express;

  beforeEach(async () => {
    app = createApp();
    await registerRoutes(app);
    app.use('/api/payroll', payrollRouter);
    app.use('/api/loans', loansRouter);
    app.use('/api/cars', carsRouter);
    app.use(errorHandler);
    vi.clearAllMocks();
  });

  it('GET /api/employees returns employees list', async () => {
    const mockEmployees = [
      {
        id: '1',
        employeeCode: 'E001',
        firstName: 'John',
        lastName: 'Doe',
        position: 'Dev',
        salary: '0',
        workLocation: 'Office',
        startDate: '2024-01-01',
      },
    ];
    (storage.getEmployees as any).mockResolvedValue(mockEmployees);

    const res = await request(app).get('/api/employees');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(mockEmployees);
  });

  it('GET /api/employees/import/template returns xlsx with headers', async () => {
    const res = await request(app)
      .get('/api/employees/import/template')
      .buffer()
      .parse((res, callback) => {
        res.setEncoding('binary');
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => { callback(null, Buffer.from(data, 'binary')); });
      });

    expect(res.status).toBe(200);
    const wb = XLSX.read(res.body, { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const headers = XLSX.utils.sheet_to_json(sheet, { header: 1 })[0];
    expect(headers).toEqual([
      'id/معرف',
      'English Name/اسم الانجليزي',
      'Image URL/رابط الصورة',
      'Arabic Name/اسم المؤظف',
      'Job Title/لقب',
      'Work Location/مكان العمل',
      'Nationality/الجنسية',
      'Profession/المهنة',
      'Employment Date/تاريخ التوظيف',
      'Status/الحالة',
      'Civil ID Number/رقم البطاقة المدنية',
      'civil id issue date',
      'Civil ID Expiry Date/تاريخ انتهاء البطاقة المدنية',
      'Passport Number/رقم جواز السفر',
      'Passport Issue Date/تاريخ اصدار جواز السفر',
      'Passport Expiry Date/تاريخ انتهاء جواز السفر',
      'Salaries/رواتب',
      'loans',
      'Transferable/تحويل',
      'Payment Method/طريقة الدفع',
      'Documents/مستندات or izenamal',
      'Days Worked/أيام العمل',
      'phonenumber',
      'civil id pic',
      'passport pic',
      'driving license',
      'driving license issue date',
      'driving license expiry date',
      'other docs',
      'iban',
      'SWIFTCODE',
      'residency name',
      'residency on company or not',
      'profession department',
      'profession code',
      'profession category',
    ]);
  });

  it('POST /api/employees validates input data', async () => {
    const res = await request(app).post('/api/employees').send({});
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('Invalid employee data');
  });

  // From "main": verify numeric coercion from string inputs
  it('POST /api/employees creates employee with numeric fields', async () => {
    const created = {
      id: '2',
      firstName: 'Sam',
      lastName: 'Smith',
      position: 'Dev',
      salary: 1000,
      startDate: '2024-01-01',
      visaAlertDays: 30,
      role: 'employee'
    };
    (storage.createEmployee as any).mockResolvedValue(created);

    const payload = {
      firstName: 'Sam',
      lastName: 'Smith',
      position: 'Dev',
      salary: '1000',
      startDate: '2024-01-01',
      visaAlertDays: 30
    };

    const res = await request(app).post('/api/employees').send(payload);

    expect(res.status).toBe(201);
    expect(res.body).toEqual(created);
    expect(storage.createEmployee).toHaveBeenCalledWith(
      expect.objectContaining({
        firstName: 'Sam',
        lastName: 'Smith',
        position: 'Dev',
        salary: 1000,
        startDate: '2024-01-01',
        visaAlertDays: 30,
        role: 'employee'
      })
    );
  });

  // From "codex": ensure numeric fields are accepted and passed as numbers to storage
  it('POST /api/employees accepts numeric fields and passes numbers to storage', async () => {
    const created = {
      id: '1',
      employeeCode: 'EMP1',
      firstName: 'Jane',
      lastName: 'Doe',
      position: 'Dev',
      salary: '1000',
      additions: '50',
      visaAlertDays: 15,
      workLocation: 'Office',
      startDate: '2024-01-01',
      role: 'employee'
    };
    (storage.createEmployee as any).mockResolvedValue(created);

    const res = await request(app).post('/api/employees').send({
      firstName: 'Jane',
      lastName: 'Doe',
      position: 'Dev',
      salary: 1000,
      additions: 50,
      visaAlertDays: 15,
      startDate: '2024-01-01'
    });

    expect(res.status).toBe(201);
    expect(res.body).toEqual(created);

    const arg = (storage.createEmployee as any).mock.calls[0][0];
    expect(arg.salary).toBe(1000);
    expect(arg.additions).toBe(50);
    expect(arg.visaAlertDays).toBe(15);
  });

  it('POST /api/employees coerces numeric string-like fields to strings', async () => {
    const created = {
      id: '10',
      employeeCode: '123',
      firstName: 'Num',
      lastName: 'Str',
      position: 'Dev',
      salary: 1000,
      startDate: '2024-01-01',
      role: 'employee',
      phone: '123456789',
      emergencyPhone: '987654321',
      nationalId: '555555',
    };
    (storage.createEmployee as any).mockResolvedValue(created);

    const res = await request(app).post('/api/employees').send({
      firstName: 'Num',
      lastName: 'Str',
      position: 'Dev',
      salary: 1000,
      startDate: '2024-01-01',
      employeeCode: 123,
      phone: 123456789,
      emergencyPhone: 987654321,
      nationalId: 555555,
    });

    expect(res.status).toBe(201);
    const arg = (storage.createEmployee as any).mock.calls[0][0];
    expect(arg.employeeCode).toBe('123');
    expect(arg.phone).toBe('123456789');
    expect(arg.emergencyPhone).toBe('987654321');
    expect(arg.nationalId).toBe('555555');
  });

  // Keep the "missing optional numeric fields" scenario
  it('POST /api/employees creates employee when optional numeric fields are missing', async () => {
    const created = {
      id: '3',
      firstName: 'Ana',
      lastName: 'Lee',
      position: 'Dev',
      salary: 1200,
      startDate: '2024-01-01',
      role: 'employee'
    };
    (storage.createEmployee as any).mockResolvedValue(created);

    const payload = {
      firstName: 'Ana',
      lastName: 'Lee',
      position: 'Dev',
      salary: '1200', // string input should be coerced
      startDate: '2024-01-01'
      // intentionally omitting optional numeric fields like additions, visaAlertDays
    };

    const res = await request(app).post('/api/employees').send(payload);

    expect(res.status).toBe(201);
    expect(res.body).toEqual(created);

    const arg = (storage.createEmployee as any).mock.calls[0][0];
    expect(arg.salary).toBe(1200);
    expect(arg).not.toHaveProperty('additions');
    expect(arg).not.toHaveProperty('visaAlertDays');
  });

  it('POST /api/employees accepts blank optional date fields', async () => {
    const created = {
      id: '4',
      firstName: 'Date',
      lastName: 'Blank',
      position: 'Dev',
      salary: 1000,
      startDate: '2024-01-01',
      passportIssueDate: null,
      role: 'employee'
    };
    (storage.createEmployee as any).mockResolvedValue(created);

    const res = await request(app).post('/api/employees').send({
      firstName: 'Date',
      lastName: 'Blank',
      position: 'Dev',
      salary: '1000',
      startDate: '2024-01-01',
      passportIssueDate: ''
    });

    expect(res.status).toBe(201);
    const arg = (storage.createEmployee as any).mock.calls[0][0];
    expect(arg.passportIssueDate).toBe(null);
  });

  it('POST /api/employees omits blank employeeCode for auto-generation', async () => {
    const created = {
      id: '5',
      employeeCode: 'EMP1234',
      firstName: 'NoCode',
      lastName: 'Smith',
      position: 'Dev',
      salary: 1000,
      startDate: '2024-01-01',
      role: 'employee'
    };
    (storage.createEmployee as any).mockResolvedValue(created);

    const res = await request(app).post('/api/employees').send({
      employeeCode: '   ',
      firstName: 'NoCode',
      lastName: 'Smith',
      position: 'Dev',
      salary: 1000,
      startDate: '2024-01-01'
    });

    expect(res.status).toBe(201);
    const arg = (storage.createEmployee as any).mock.calls[0][0];
    expect(arg).not.toHaveProperty('employeeCode');
  });

  it('POST /api/employees returns 409 on duplicate code', async () => {
    (storage.createEmployee as any).mockRejectedValue({ code: '23505' });

    const res = await request(app).post('/api/employees').send({
      employeeCode: 'E001',
      firstName: 'Dup',
      lastName: 'Code',
      position: 'Dev',
      salary: 1000,
      startDate: '2024-01-01'
    });

    expect(res.status).toBe(409);
  });

  it('PUT /api/employees/:id rejects employeeCode updates', async () => {
    const res = await request(app)
      .put('/api/employees/1')
      .send({ employeeCode: 'NEW' });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('Employee code cannot be updated');
  });

  it('PUT /api/employees/:id accepts numeric fields', async () => {
    const updated = {
      id: '1',
      employeeCode: 'EMP1',
      firstName: 'Jane',
      lastName: 'Doe',
      position: 'Dev',
      salary: '2000',
      visaAlertDays: 20,
      workLocation: 'Office',
      startDate: '2024-01-01',
      role: 'employee'
    };
    (storage.updateEmployee as any).mockResolvedValue(updated);

    const res = await request(app)
      .put('/api/employees/1')
      .send({ salary: 2000, visaAlertDays: 20 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(updated);

    const arg = (storage.updateEmployee as any).mock.calls[0][1];
    expect(arg.salary).toBe(2000);
    expect(arg.visaAlertDays).toBe(20);
  });

  it('PUT /api/employees/:id coerces numeric string-like fields to strings', async () => {
    const updated = {
      id: '1',
      employeeCode: 'EMP1',
      firstName: 'Jane',
      lastName: 'Doe',
      position: 'Dev',
      salary: '2000',
      workLocation: 'Office',
      startDate: '2024-01-01',
      role: 'employee',
      phone: '111',
      emergencyPhone: '222',
      nationalId: '333',
    };
    (storage.updateEmployee as any).mockResolvedValue(updated);

    const res = await request(app)
      .put('/api/employees/1')
      .send({ phone: 111, emergencyPhone: 222, nationalId: 333 });

    expect(res.status).toBe(200);
    const arg = (storage.updateEmployee as any).mock.calls[0][1];
    expect(arg.phone).toBe('111');
    expect(arg.emergencyPhone).toBe('222');
    expect(arg.nationalId).toBe('333');
  });

  it('POST /api/employees/import returns headers when no mapping provided', async () => {
    const wb = XLSX.utils.book_new();
    const data = [{ Code: 'E001', First: 'John' }];
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const res = await request(app)
      .post('/api/employees/import')
      .attach('file', buffer, 'employees.xlsx');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ headers: ['Code', 'First'], mapping: { Code: 'employeeCode' } });
  });

  it('POST /api/employees/import errors when required column empty', async () => {
    const wb = XLSX.utils.book_new();
    const data = [
      { Code: '', Name: '', Position: 'Dev', Start: 45432, Salary: '1000' },
      { Code: '', Name: '', Position: 'QA', Start: 45433, Salary: '1200' }
    ];
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const mapping = {
      Code: 'employeeCode',
      Name: 'englishName',
      Position: 'position',
      Start: 'startDate',
      Salary: 'salary'
    };

    const res = await request(app)
      .post('/api/employees/import')
      .field('mapping', JSON.stringify(mapping))
      .attach('file', buffer, 'employees.xlsx');

    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe("Column 'Name' is empty");
    expect(storage.createEmployeesBulk).not.toHaveBeenCalled();
  });

  it('POST /api/employees/import normalizes data types and reports errors', async () => {
    (storage.getEmployees as any).mockResolvedValue([]);
    (storage.getEmployeeCustomFields as any).mockResolvedValue([]);
    (storage.createEmployeeCustomField as any).mockImplementation(async ({ name }) => ({ id: 'f1', name }));
    (storage.createEmployeesBulk as any).mockImplementation(async emps => ({ success: emps.length, failed: 0, employees: emps.map((e,i)=>({ id: String(i+1), ...e })) }));

    const wb = XLSX.utils.book_new();
    const data = [
      { Code: 'E001', Name: 'John Doe', Position: 'Dev', Start: 45432, Salary: '1000', الحالة: 'نشط', 'Civil ID Number': '2.75021E+11', Transfer: 'y', 'Passport Issue Date': '', 'residency on company or not': 'FALSE' },
      { Code: '', Name: 'Bad Guy', Position: 'QA', Start: 45433, Salary: 'abc', الحالة: 'نشط', Transfer: 'yes' }
    ];
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const mapping = {
      Code: 'employeeCode',
      Name: 'englishName',
      Position: 'position',
      Start: 'startDate',
      Salary: 'salary',
      الحالة: 'status',
      'Civil ID Number': 'civilId',
      Transfer: 'transferable',
      'Passport Issue Date': 'passportIssueDate',
      'residency on company or not': 'residencyOnCompany'
    };

    const res = await request(app)
      .post('/api/employees/import')
      .field('mapping', JSON.stringify(mapping))
      .attach('file', buffer, 'employees.xlsx');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(1);
    expect(res.body.failed).toBe(1);
    expect(res.body.errors).toHaveLength(1);
    expect(res.body.errors[0].column).toBe('salary');
    const employee = (storage.createEmployeesBulk as any).mock.calls[0][0][0];
    expect(employee.startDate).toBe('2024-05-20');
    expect(employee.civilId).toBe('275021000000');
    expect(employee.transferable).toBe(true);
    expect(employee.passportIssueDate).toBe(null);
    expect(employee.status).toBe('active');
    expect(employee.residencyOnCompany).toBe(false);
  });

  it('POST /api/employees/import allows rows without employeeCode', async () => {
    (storage.getEmployees as any).mockResolvedValue([]);
    (storage.getEmployeeCustomFields as any).mockResolvedValue([]);
    (storage.createEmployeeCustomField as any).mockImplementation(async ({ name }) => ({ id: 'f1', name }));
    (storage.createEmployeesBulk as any).mockImplementation(async emps => ({ success: emps.length, failed: 0, employees: emps.map((e,i)=>({ id: String(i+1), employeeCode: `EMP${i+1}`, ...e })) }));

    const wb = XLSX.utils.book_new();
    const data = [
      { Code: '', Name: 'John Doe', Position: 'Dev', Start: 45432, Salary: '1000' },
      { Code: '', Name: 'Jane Doe', Position: 'QA', Start: 45433, Salary: '1200' }
    ];
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const mapping = {
      Code: 'employeeCode',
      Name: 'englishName',
      Position: 'position',
      Start: 'startDate',
      Salary: 'salary'
    };

    const res = await request(app)
      .post('/api/employees/import')
      .field('mapping', JSON.stringify(mapping))
      .attach('file', buffer, 'employees.xlsx');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(2);
    expect(res.body.failed).toBe(0);
    expect(res.body.errors).toHaveLength(0);
    const employeesArg = (storage.createEmployeesBulk as any).mock.calls[0][0];
    expect(employeesArg[0].employeeCode).toBeUndefined();
    expect(employeesArg[1].employeeCode).toBeUndefined();
  });

  it('GET /api/payroll returns payroll runs', async () => {
    const mockRuns = [
      { id: '1', period: '2024-01', startDate: '2024-01-01', endDate: '2024-01-31', grossAmount: '0', totalDeductions: '0', netAmount: '0', status: 'completed' }
    ];
    (storage.getPayrollRuns as any).mockResolvedValue(mockRuns);

    const res = await request(app).get('/api/payroll');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(mockRuns);
  });

  it('GET /api/loans returns loans list', async () => {
    const mockLoans = [
      { id: '1', employeeId: '1', amount: '1000', status: 'active', remainingAmount: '500', monthlyDeduction: '100' }
    ];
    (storage.getLoans as any).mockResolvedValue(mockLoans);

    const res = await request(app).get('/api/loans');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(mockLoans);
  });

  it('GET /api/cars returns cars list', async () => {
    const mockCars = [
      { id: '1', make: 'Toyota', model: 'Corolla', year: 2020, status: 'available' }
    ];
    (storage.getCars as any).mockResolvedValue(mockCars);

    const res = await request(app).get('/api/cars');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(mockCars);
  });

  it('GET /api/cars/import/template returns xlsx with headers', async () => {
    const res = await request(app)
      .get('/api/cars/import/template')
      .buffer()
      .parse((res, cb) => {
        res.setEncoding('binary');
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => { cb(null, Buffer.from(data, 'binary')); });
      });

    expect(res.status).toBe(200);
    const wb = XLSX.read(res.body, { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const headers = XLSX.utils.sheet_to_json(sheet, { header: 1 })[0];
    expect(headers).toEqual([
      'Serial',
      'emp',
      'Driver',
      'Company',
      'Registration Book in Name of',
      'Car Model',
      'Plate Number',
      'Registration Expiry Date',
      'Notes',
    ]);
  });

  it('POST /api/cars/import returns headers when no mapping provided', async () => {
    const wb = XLSX.utils.book_new();
    const data = [{ Model: 'Corolla', Plate: 'ABC123' }];
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const res = await request(app)
      .post('/api/cars/import')
      .attach('file', buffer, 'cars.xlsx');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ headers: ['Model', 'Plate'] });
  });

  it('POST /api/cars/import imports cars using mapping', async () => {
    (storage.getCars as any).mockResolvedValue([]);
    (storage.createCar as any).mockImplementation(async car => ({ id: '1', ...car }));
    const wb = XLSX.utils.book_new();
    const data = [{ Model: 'Corolla', Plate: 'ABC123' }];
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const mapping = { Model: 'model', Plate: 'plateNumber' };

    const res = await request(app)
      .post('/api/cars/import')
      .field('mapping', JSON.stringify(mapping))
      .attach('file', buffer, 'cars.xlsx');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: 1, failed: 0 });
    expect(storage.createCar).toHaveBeenCalled();
  });

  it('POST /api/cars/import errors when required mapping missing', async () => {
    const wb = XLSX.utils.book_new();
    const data = [{ Model: 'Corolla', Plate: 'ABC123' }];
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const mapping = { Model: 'model' }; // missing plateNumber mapping

    const res = await request(app)
      .post('/api/cars/import')
      .field('mapping', JSON.stringify(mapping))
      .attach('file', buffer, 'cars.xlsx');

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch('Missing mapping for required fields');
  });
});
