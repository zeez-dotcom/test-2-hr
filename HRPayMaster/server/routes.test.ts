import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { errorHandler } from './errorHandler';
import * as XLSX from 'xlsx';
import sharp from 'sharp';

vi.mock('./storage', () => {
  class DuplicateEmployeeCodeError extends Error {}
  return {
    storage: {
      getEmployees: vi.fn(),
      createEmployee: vi.fn(),
      createEmployeesBulk: vi.fn(),
      updateEmployee: vi.fn(),
      getEmployee: vi.fn(),
      getEmployeeCustomFields: vi.fn(),
      createEmployeeCustomField: vi.fn(),
      createEmployeeCustomValue: vi.fn(),
      getPayrollRuns: vi.fn(),
      getLoans: vi.fn(),
      createLoan: vi.fn(),
      getAssets: vi.fn(),
      getAsset: vi.fn(),
      updateAsset: vi.fn(),
      createAssetAssignment: vi.fn(),
      updateAssetAssignment: vi.fn(),
      getAssetAssignment: vi.fn(),
      deleteAssetAssignment: vi.fn(),
      getCars: vi.fn(),
      getCar: vi.fn(),
      createCar: vi.fn(),
      updateCar: vi.fn(),
      createCarAssignment: vi.fn(),
      updateCarAssignment: vi.fn(),
      getCarAssignments: vi.fn(),
      getCarAssignment: vi.fn(),
      deleteCarAssignment: vi.fn(),
      createEmployeeEvent: vi.fn(),
      getEmployeeReport: vi.fn(),
      getCompanyPayrollSummary: vi.fn(),
      getLoanReportDetails: vi.fn(),
      getLoanBalances: vi.fn(),
      getAssetUsageDetails: vi.fn(),
      getFleetUsage: vi.fn(),
    },
    DuplicateEmployeeCodeError,
  };
});

vi.mock('./db', () => {
  return {
    db: {
      query: {
        payrollRuns: {
          findFirst: vi.fn(),
        },
      },
    },
  };
});

import { db } from './db';
import { registerRoutes } from './routes';
import { storage } from './storage';

function createApp() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use((req, _res, next) => {
    // Stub authentication and user role for tests
    // @ts-ignore
    req.isAuthenticated = () => true;
    // @ts-ignore
    req.user = { role: 'admin' };
    next();
  });
  return app;
}

function createUnauthenticatedApp() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use((req, _res, next) => {
    // @ts-ignore
    req.isAuthenticated = () => false;
    next();
  });
  return app;
}

describe('auth routes', () => {
  let app: express.Express;

  beforeEach(async () => {
    app = createUnauthenticatedApp();
    await registerRoutes(app);
    app.use(errorHandler);
  });

  it('GET /api/me returns 401 when not authenticated', async () => {
    const res = await request(app).get('/api/me');
    expect(res.status).toBe(401);
  });
});

describe('employee routes', () => {
  let app: express.Express;

  beforeEach(async () => {
    app = createApp();
    await registerRoutes(app);
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

  it('GET /api/car-assignments forwards filters to storage', async () => {
    (storage.getCarAssignments as any).mockResolvedValue([]);

    const res = await request(app)
      .get('/api/car-assignments')
      .query({ plateNumber: 'ABC123', vin: 'VIN123', serial: 'SER123' });

    expect(res.status).toBe(200);
    expect(storage.getCarAssignments).toHaveBeenCalledWith({
      plateNumber: 'ABC123',
      vin: 'VIN123',
      serial: 'SER123',
    });
  });

  it('POST /api/assets/:id/status updates asset status and active assignment', async () => {
    (storage.getAsset as any).mockResolvedValue({
      id: 'asset-1',
      status: 'assigned',
      currentAssignment: {
        id: 'asg-1',
        assetId: 'asset-1',
        employeeId: 'emp-1',
        status: 'active',
        returnDate: null,
      },
    });
    (storage.updateAsset as any).mockResolvedValue({ id: 'asset-1', status: 'maintenance' });

    const res = await request(app)
      .post('/api/assets/asset-1/status')
      .send({ status: 'Maintenance' });

    expect(res.status).toBe(200);
    expect(storage.updateAsset).toHaveBeenCalledWith('asset-1', { status: 'maintenance' });
    expect(storage.updateAssetAssignment).toHaveBeenCalledWith(
      'asg-1',
      expect.objectContaining({ status: 'maintenance', returnDate: expect.any(String) }),
    );
  });

  it('POST /api/cars/:id/status updates car status and active assignment', async () => {
    (storage.getCar as any).mockResolvedValue({
      id: 'car-1',
      status: 'assigned',
      currentAssignment: {
        id: 'car-asg-1',
        carId: 'car-1',
        employeeId: 'emp-2',
        status: 'active',
        returnDate: null,
      },
    });
    (storage.updateCar as any).mockResolvedValue({ id: 'car-1', status: 'maintenance' });

    const res = await request(app)
      .post('/api/cars/car-1/status')
      .send({ status: ' MAINTENANCE ' });

    expect(res.status).toBe(200);
    expect(storage.updateCar).toHaveBeenCalledWith('car-1', { status: 'maintenance' });
    expect(storage.updateCarAssignment).toHaveBeenCalledWith(
      'car-asg-1',
      expect.objectContaining({ status: 'maintenance', returnDate: expect.any(String) }),
    );
  });

  it('PUT /api/asset-assignments/:id preserves maintenance status', async () => {
    (storage.updateAssetAssignment as any).mockResolvedValue({ id: 'asg-1', assetId: 'asset-1', employeeId: 'emp-1' });
    (storage.getAssetAssignment as any).mockResolvedValue({
      id: 'asg-1',
      assetId: 'asset-1',
      employeeId: 'emp-1',
      status: 'maintenance',
      asset: { name: 'Laptop' },
      employee: { firstName: 'Test', lastName: 'User' },
    });

    const res = await request(app)
      .put('/api/asset-assignments/asg-1')
      .send({ status: 'maintenance' });

    expect(res.status).toBe(200);
    expect(storage.updateAssetAssignment).toHaveBeenCalledWith('asg-1', { status: 'maintenance' });
    expect(storage.updateAsset).toHaveBeenCalledWith('asset-1', { status: 'maintenance' });
  });

  it('PUT /api/car-assignments/:id preserves maintenance status', async () => {
    (storage.updateCarAssignment as any).mockResolvedValue({ id: 'car-asg-1', carId: 'car-1', employeeId: 'emp-2' });
    (storage.getCarAssignment as any).mockResolvedValue({
      id: 'car-asg-1',
      carId: 'car-1',
      employeeId: 'emp-2',
      status: 'maintenance',
      car: { make: 'Toyota', model: 'Corolla' },
      employee: { firstName: 'Sam', lastName: 'Driver' },
    });

    const res = await request(app)
      .put('/api/car-assignments/car-asg-1')
      .send({ status: 'maintenance' });

    expect(res.status).toBe(200);
    expect(storage.updateCarAssignment).toHaveBeenCalledWith('car-asg-1', { status: 'maintenance' });
    expect(storage.updateCar).toHaveBeenCalledWith('car-1', { status: 'maintenance' });
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

  it('POST /api/employees compresses large base64 images', async () => {
    const large = await sharp({
      create: {
        width: 2000,
        height: 2000,
        channels: 3,
        background: { r: 255, g: 0, b: 0 }
      }
    })
      .jpeg()
      .toBuffer();
    const base64 = `data:image/jpeg;base64,${large.toString('base64')}`;
    (storage.createEmployee as any).mockImplementation(async e => e);
    const res = await request(app).post('/api/employees').send({
      firstName: 'Img',
      lastName: 'Big',
      position: 'Dev',
      salary: 1000,
      startDate: '2024-01-01',
      profileImage: base64
    });
    expect(res.status).toBe(201);
    const arg = (storage.createEmployee as any).mock.calls[0][0];
    expect(arg.profileImage.length).toBeLessThan(base64.length);
  });

  it('POST /api/employees leaves non-image inputs unchanged', async () => {
    const pdf = `data:application/pdf;base64,${Buffer.from('%PDF').toString('base64')}`;
    (storage.createEmployee as any).mockImplementation(async e => e);
    const res = await request(app).post('/api/employees').send({
      firstName: 'Pdf',
      lastName: 'Test',
      position: 'Dev',
      salary: 1000,
      startDate: '2024-01-01',
      profileImage: pdf
    });
    expect(res.status).toBe(201);
    const arg = (storage.createEmployee as any).mock.calls[0][0];
    expect(arg.profileImage).toBe(pdf);
  });

  it('POST /api/employees rejects images without base64 prefix', async () => {
    const res = await request(app).post('/api/employees').send({
      firstName: 'Bad',
      lastName: 'Img',
      position: 'Dev',
      salary: 1000,
      startDate: '2024-01-01',
      profileImage: 'not-a-data-uri'
    });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/Invalid image data/);
    expect(storage.createEmployee).not.toHaveBeenCalled();
  });

  it('POST /api/employees rejects invalid base64 image data', async () => {
    const invalidBase64 = 'data:image/jpeg;base64,@@@';
    const res = await request(app).post('/api/employees').send({
      firstName: 'Bad',
      lastName: 'Image',
      position: 'Dev',
      salary: 1000,
      startDate: '2024-01-01',
      profileImage: invalidBase64
    });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/Invalid image data/);
    expect(storage.createEmployee).not.toHaveBeenCalled();
  });

  it('PUT /api/employees/:id compresses large base64 images', async () => {
    const large = await sharp({
      create: {
        width: 2000,
        height: 2000,
        channels: 3,
        background: { r: 255, g: 0, b: 0 }
      }
    })
      .jpeg()
      .toBuffer();
    const base64 = `data:image/jpeg;base64,${large.toString('base64')}`;
    (storage.updateEmployee as any).mockImplementation(async (_id, u) => ({ id: '1', firstName: 'T', lastName: 'U', ...u }));
    const res = await request(app).put('/api/employees/1').send({ profileImage: base64 });
    expect(res.status).toBe(200);
    const arg = (storage.updateEmployee as any).mock.calls[0][1];
    expect(arg.profileImage.length).toBeLessThan(base64.length);
  });

  it('PUT /api/employees/:id leaves non-image inputs unchanged', async () => {
    const pdf = `data:application/pdf;base64,${Buffer.from('%PDF').toString('base64')}`;
    (storage.updateEmployee as any).mockImplementation(async (_id, u) => ({ id: '1', firstName: 'T', lastName: 'U', ...u }));
    const res = await request(app).put('/api/employees/1').send({ profileImage: pdf });
    expect(res.status).toBe(200);
    const arg = (storage.updateEmployee as any).mock.calls[0][1];
    expect(arg.profileImage).toBe(pdf);
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

  it('PUT /api/employees/:id handles missing addedBy user gracefully', async () => {
    const appWithUser = createApp();
    appWithUser.use((req, _res, next) => {
      // @ts-ignore
      req.user = { employeeId: 'missing-id' };
      next();
    });
    await registerRoutes(appWithUser);
    appWithUser.use(errorHandler);

    const updated = {
      id: 'emp1',
      firstName: 'Jane',
      lastName: 'Doe',
      salary: '0',
      startDate: '2024-01-01',
    };
    (storage.updateEmployee as any).mockResolvedValue(updated);
    (storage.getEmployee as any).mockResolvedValue(undefined);
    (storage.createEmployeeEvent as any).mockResolvedValue({});

    const res = await request(appWithUser)
      .put('/api/employees/emp1')
      .send({ firstName: 'Jane' });

    expect(res.status).toBe(200);
    expect(storage.createEmployeeEvent).toHaveBeenCalledTimes(1);
    const eventArg = (storage.createEmployeeEvent as any).mock.calls[0][0];
    expect(eventArg.addedBy).toBeUndefined();
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

  it('POST /api/loans defaults remainingAmount to amount', async () => {
    const payload = {
      employeeId: '1',
      amount: '1000',
      monthlyDeduction: '100',
      startDate: '2024-01-01',
      status: 'active',
      interestRate: '0',
    };
    const created = { id: '1', remainingAmount: '1000', ...payload };
    (storage.createLoan as any).mockResolvedValue(created);

    const res = await request(app).post('/api/loans').send({
      employeeId: payload.employeeId,
      amount: payload.amount,
      monthlyDeduction: payload.monthlyDeduction,
      startDate: payload.startDate,
      status: payload.status,
      interestRate: payload.interestRate,
    });

    expect(res.status).toBe(201);
    const loanArg = (storage.createLoan as any).mock.calls[0][0];
    expect(loanArg.remainingAmount).toBe(loanArg.amount);
    expect(res.body.remainingAmount).toBe(res.body.amount);
  });

  it('POST /api/loans accepts UUID employeeId unchanged', async () => {
    const employeeId = '123e4567-e89b-12d3-a456-426614174000';
    const payload = {
      employeeId,
      amount: '1000',
      monthlyDeduction: '100',
      startDate: '2024-01-01',
      interestRate: '0',
    };
    const created = {
      id: 'loan-1',
      status: 'pending',
      remainingAmount: '1000',
      ...payload,
    };

    (storage.createLoan as any).mockResolvedValue(created);

    const res = await request(app).post('/api/loans').send(payload);

    expect(res.status).toBe(201);
    const loanArg = (storage.createLoan as any).mock.calls[0][0];
    expect(loanArg.employeeId).toBe(employeeId);
    expect(res.body.employeeId).toBe(employeeId);
  });

  it('POST /api/loans includes database error message on constraint violation', async () => {
    const dbMessage = 'insert or update on table "loans" violates foreign key constraint';
    (storage.createLoan as any).mockRejectedValue(dbMessage);

    const res = await request(app).post('/api/loans').send({
      employeeId: '1',
      amount: '1000',
      monthlyDeduction: '100',
      startDate: '2024-01-01',
      status: 'active',
      interestRate: '0',
    });

    expect(res.status).toBe(500);
    expect(res.body.error.details.message).toContain('violates foreign key constraint');
  });

  it('GET /api/cars returns cars list including registration document', async () => {
    const mockCars = [
      {
        id: '1',
        make: 'Toyota',
        model: 'Corolla',
        year: 2020,
        status: 'available',
        registrationDocumentImage: 'data:image/png;base64,AAAA',
      },
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

  it('GET /api/reports/employees/:id returns report data', async () => {
    const mockReport = [
      {
        period: '2024-01',
        payrollEntries: [
          {
            bonusAmount: '100',
            taxDeduction: '30',
            socialSecurityDeduction: '10',
            healthInsuranceDeduction: '5',
            loanDeduction: '0',
            otherDeductions: '0',
            netPay: '2000',
          },
        ],
        employeeEvents: [
          { eventType: 'bonus', amount: '50' },
          { eventType: 'deduction', amount: '20' },
        ],
        loans: [{ monthlyDeduction: '30' }],
        vacationRequests: [],
      },
    ];
    (storage.getEmployeeReport as any).mockResolvedValue(mockReport);

    const res = await request(app)
      .get('/api/reports/employees/1')
      .query({ startDate: '2024-01-01', endDate: '2024-12-31' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      {
        period: '2024-01',
        totals: { bonuses: 150, deductions: 95, netPay: 2000 },
        payrollEntries: mockReport[0].payrollEntries,
        employeeEvents: mockReport[0].employeeEvents,
        loans: mockReport[0].loans,
        vacationRequests: mockReport[0].vacationRequests,
      },
    ]);
  });

  it('GET /api/reports/employees/:id handles errors', async () => {
    (storage.getEmployeeReport as any).mockRejectedValue(new Error('fail'));

    const res = await request(app)
      .get('/api/reports/employees/1')
      .query({ startDate: '2024-01-01', endDate: '2024-12-31' });

    expect(res.status).toBe(500);
    expect(res.body.error.message).toBe('Failed to fetch employee report');
  });

  it('GET /api/reports/employees/:id applies default dates', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-15'));
    (storage.getEmployeeReport as any).mockResolvedValue([]);

    const res = await request(app).get('/api/reports/employees/1');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
    expect(storage.getEmployeeReport).toHaveBeenCalledWith('1', {
      startDate: '2024-01-01',
      endDate: '2024-06-15',
      groupBy: 'month',
    });
    vi.useRealTimers();
  });

  it('GET /api/reports/employees/:id returns 400 for invalid date range', async () => {
    const res = await request(app)
      .get('/api/reports/employees/1')
      .query({ startDate: '2024-12-31', endDate: '2024-01-01' });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('Invalid query parameters');
    expect(res.body.error.details[0].message).toBe(
      'startDate must be before or equal to endDate'
    );
    expect(res.body.error.details[0].path).toEqual(['endDate']);
    expect(storage.getEmployeeReport).not.toHaveBeenCalled();
  });

  it('GET /api/reports/payroll returns 400 for invalid date range', async () => {
    const res = await request(app)
      .get('/api/reports/payroll')
      .query({ startDate: '2024-12-31', endDate: '2024-01-01' });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('Invalid query parameters');
    expect(res.body.error.details[0].message).toBe(
      'startDate must be before or equal to endDate'
    );
    expect(res.body.error.details[0].path).toEqual(['endDate']);
    expect(storage.getCompanyPayrollSummary).not.toHaveBeenCalled();
  });

  it('GET /api/reports/payroll applies default dates', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-15'));
    (storage.getCompanyPayrollSummary as any).mockResolvedValue([]);

    const res = await request(app).get('/api/reports/payroll');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
    expect(storage.getCompanyPayrollSummary).toHaveBeenCalledWith({
      startDate: '2024-01-01',
      endDate: '2024-06-15',
      groupBy: 'month',
    });
    vi.useRealTimers();
  });

  it('GET /api/reports/payroll returns 400 when endDate before default startDate', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-15'));

    const res = await request(app)
      .get('/api/reports/payroll')
      .query({ endDate: '2023-12-31' });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('Invalid query parameters');
    expect(res.body.error.details[0].message).toBe(
      'startDate must be before or equal to endDate'
    );
    expect(storage.getCompanyPayrollSummary).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('GET /api/reports/payroll returns payroll summary', async () => {
    const summary = [
      {
        period: '2024-01',
        payrollEntries: [
          { grossPay: '100', netPay: '90' },
          { grossPay: '50', netPay: '40' }
        ]
      }
    ];
    (storage.getCompanyPayrollSummary as any).mockResolvedValue(summary);

    const res = await request(app)
      .get('/api/reports/payroll')
      .query({ startDate: '2024-01-01', endDate: '2024-12-31' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { period: '2024-01', totals: { grossPay: 150, netPay: 130 } }
    ]);
  });

  it('GET /api/reports/loan-balances returns loan details', async () => {
    const details = [
      {
        loanId: 'l1',
        employeeId: 'e1',
        originalAmount: 500,
        remainingAmount: 200,
        totalRepaid: 300,
        deductionInRange: 100,
        status: 'active',
        pausedByVacation: false,
        pauseNote: null,
        startDate: '2024-01-01',
        endDate: null,
      },
    ];
    (storage.getLoanReportDetails as any).mockResolvedValue(details);

    const res = await request(app)
      .get('/api/reports/loan-balances')
      .query({ startDate: '2024-01-01', endDate: '2024-03-31' });

    expect(res.status).toBe(200);
    expect(storage.getLoanReportDetails).toHaveBeenCalledWith({
      startDate: '2024-01-01',
      endDate: '2024-03-31',
    });
    expect(res.body).toEqual(details);
  });

  it('GET /api/reports/asset-usage returns usage details with filters', async () => {
    const usage = [
      {
        assignmentId: 'assign-1',
        assetId: 'a1',
        assetName: 'Laptop',
        assetType: 'IT',
        assetStatus: 'assigned',
        assetDetails: 'MacBook',
        employeeId: 'e1',
        employeeCode: 'EMP-001',
        employeeName: 'Ada Lovelace',
        assignedDate: '2024-01-01',
        returnDate: null,
        status: 'active',
        notes: 'Primary device',
      },
    ];
    (storage.getAssetUsageDetails as any).mockResolvedValue(usage);

    const res = await request(app)
      .get('/api/reports/asset-usage')
      .query({ startDate: '2024-01-01', endDate: '2024-02-01' });

    expect(res.status).toBe(200);
    expect(storage.getAssetUsageDetails).toHaveBeenCalledWith({
      startDate: '2024-01-01',
      endDate: '2024-02-01',
    });
    expect(res.body).toEqual(usage);
  });

  it('GET /api/reports/fleet-usage returns car assignments with filters', async () => {
    const fleet = [
      {
        assignmentId: 'fleet-1',
        carId: 'car-1',
        vehicle: 'Toyota Hilux 2021',
        plateNumber: 'KUW-4567',
        vin: 'VIN-4567',
        serial: 'SER-4567',
        employeeId: 'emp-1',
        employeeCode: 'EMP-001',
        employeeName: 'Ada Lovelace',
        assignedDate: '2024-01-01',
        returnDate: null,
        status: 'active',
        notes: 'Delivery route',
      },
    ];
    (storage.getFleetUsage as any).mockResolvedValue(fleet);

    const res = await request(app)
      .get('/api/reports/fleet-usage')
      .query({ startDate: '2024-01-01', endDate: '2024-02-01' });

    expect(res.status).toBe(200);
    expect(storage.getFleetUsage).toHaveBeenCalledWith({
      startDate: '2024-01-01',
      endDate: '2024-02-01',
    });
    expect(res.body).toEqual(fleet);
  });
});

describe('payroll routes', () => {
  let app: express.Express;

  beforeEach(async () => {
    app = createApp();
    await registerRoutes(app);
    app.use(errorHandler);
    vi.clearAllMocks();
  });

  it('POST /api/payroll/generate returns 409 when period overlaps existing run', async () => {
    const existing = {
      id: 'run1',
      period: 'Jan 2024',
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-01-31'),
      grossAmount: '0',
      totalDeductions: '0',
      netAmount: '0',
      status: 'completed',
    };
    (db.query.payrollRuns.findFirst as any).mockResolvedValue(existing);

    const res = await request(app)
      .post('/api/payroll/generate')
      .send({ period: 'Feb 2024', startDate: '2024-01-15', endDate: '2024-01-20' });

    expect(res.status).toBe(409);
    expect(res.body.error.message).toBe('Payroll run already exists for this period');
    expect(storage.getEmployees).not.toHaveBeenCalled();
  });
});

describe('car routes', () => {
  let app: express.Express;

  beforeEach(async () => {
    app = createApp();
    await registerRoutes(app);
    app.use(errorHandler);
    vi.clearAllMocks();
  });

  it('POST /api/cars accepts multipart/form-data', async () => {
    const fileBuffer = Buffer.from('file-data');
    const dataUrl = `data:image/png;base64,${fileBuffer.toString('base64')}`;
    const created = {
      id: '1',
      make: 'Toyota',
      model: 'Corolla',
      year: 2020,
      plateNumber: 'ABC123',
      registrationDocumentImage: dataUrl,
    };
    (storage.createCar as any).mockResolvedValue(created);

    const res = await request(app)
      .post('/api/cars')
      .field('make', 'Toyota')
      .field('model', 'Corolla')
      .field('year', '2020')
      .field('plateNumber', 'ABC123')
      .attach('registrationDocumentImage', fileBuffer, 'doc.png');

    expect(res.status).toBe(201);
    expect(res.body).toEqual(created);
    expect(storage.createCar).toHaveBeenCalledWith({
      make: 'Toyota',
      model: 'Corolla',
      year: 2020,
      plateNumber: 'ABC123',
      registrationDocumentImage: dataUrl,
    });
  });

  it('POST /api/cars returns 400 for missing fields', async () => {
    const res = await request(app)
      .post('/api/cars');

    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('Invalid car data');
  });
});

