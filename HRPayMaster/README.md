# HRPayMaster

## Neon Database Setup

1. **Get a connection string**
   - Sign in to the [Neon](https://neon.tech) dashboard and copy the connection string for your project.
2. **Configure environment variables**
   - Copy `.env.example` to `.env` in this directory or add secrets via your hosting platform's UI.
   - Define the following variables:

     ```bash
     DATABASE_URL="<your Neon connection string>"
     SESSION_SECRET="<random session secret>"
     VITE_API_BASE_URL="http://localhost:5000"
     ```

   > [!IMPORTANT]
   > `SESSION_SECRET` must be set in production. The server will refuse to
   > start without it to ensure session data remains secure.

3. **Install dependencies**

   ```bash
   npm install
   ```

   If the installation fails when building the optional `sharp` module, make sure
   the necessary build tools and libraries are available on your system:

   - **Debian/Ubuntu:** `sudo apt-get install -y build-essential libvips-dev`
   - **macOS:** `brew install libvips`
   - **Windows:** install the Windows Build Tools and ensure `libvips` is in the
     `PATH` (see the [sharp installation guide](https://sharp.pixelplumbing.com/install)).

   After installing the prerequisites, re-run `npm install`.

4. **Run migrations**

   ```bash
   npm run db:push
   ```

   - Requires the `DATABASE_URL` environment variable.
   - Run this step whenever you pull changes that modify the database schema.
   - This will create the `users` table and seed a default `admin` account
     with username `admin`, email `admin1@gmail.com`, and the password
     `admin` hashed via bcrypt.

5. **Start the application**
   - Development: `npm run dev`
   - Production: `npm run build` followed by `npm run start`

## Error Handling

During development (`NODE_ENV` not set to `"production"`), API error
responses include both a `status` code and additional `details` to aid
debugging. In production, these fields are omitted and only a general
error message is returned.

## Employee Import Guide

### Preparing the Excel file

- Use the **Download Template** button in the import screen or GET `/api/employees/import/template` to obtain a starter workbook.
- The template includes headers in English and Arabic for common fields. Required columns are:
  - `employeeCode`
  - `firstName`
  - `lastName`
  - `position`
  - `salary`
  - `startDate`
- Save the file in **.xlsx** format. The **first row must contain column headers**, and each subsequent row represents one employee.
- Additional columns from the template can be mapped to existing or custom fields.

### Using the mapping UI

1. Go to **Employees → Import**.
2. Click **Download Template** and fill it with employee data.
3. Select your completed Excel file and click **Next** to detect headers.
4. For each detected column, use the dropdown to choose a system field or **Custom field**.
5. When choosing **Custom field**, enter a name to create a new field.
6. Ensure all required fields are mapped, then click **Import**.
7. The UI shows how many rows succeeded or failed.

### Expected server responses

| Scenario | Response |
| --- | --- |
| File uploaded without mapping | `200 { "headers": ["Code", ...] }` |
| Successful import | `200 { "success": <count>, "failed": <count> }` |
| Missing required mapping | `400 { "error": { "message": "Missing mapping for required fields: ..." } }` |
| Column not found / invalid mapping | `400 { "error": { "message": "Column 'X' not found in uploaded file" } }` |
| Server error | `500 { "error": { "message": "Failed to import employees" } }` |

**Troubleshooting**

- Verify the Excel file uses the `.xlsx` extension.
- Check that required fields are mapped and column names match the header row.
- Ensure employee codes are unique; duplicates are skipped and counted as failed.
- If the server returns an error, review the message and correct the mapping or data.

### Default employee fields

The following fields are surfaced in the employee form and table. These
columns are also present in the bulk-import template available via the
Employees → Import screen or the `/api/employees/import/template` endpoint.

| Field | Description |
| --- | --- |
| employeeCode | Unique employee identifier |
| firstName | Employee's given name |
| lastName | Employee's family name |
| nickname | Optional nickname |
| email | Email address |
| phone | Phone number |
| position | Job title or role |
| role | Access level (defaults to "employee") |
| departmentId | Associated department ID |
| salary | Monthly salary (numeric) |
| workLocation | Work location (defaults to "Office") |
| startDate | Employment start date |
| status | Employment status (active, inactive, etc.) |
| bankIban | Bank account IBAN |
| bankName | Bank name |
| emergencyContact | Emergency contact name |
| emergencyPhone | Emergency contact phone |
| nationalId | National identification number |
| address | Residential address |
| dateOfBirth | Date of birth |
| visaNumber | Visa number |
| visaType | Visa type |
| visaIssueDate | Visa issue date |
| visaExpiryDate | Visa expiry date |
| visaAlertDays | Days before visa expiry to alert |
| civilId | Civil ID number |
| civilIdIssueDate | Civil ID issue date |
| civilIdExpiryDate | Civil ID expiry date |
| civilIdAlertDays | Days before civil ID expiry to alert |
| passportNumber | Passport number |
| passportIssueDate | Passport issue date |
| passportExpiryDate | Passport expiry date |
| passportAlertDays | Days before passport expiry to alert |
| profileImage | Profile image reference |
| visaImage | Visa document image |
| civilIdImage | Civil ID document image |
| passportImage | Passport document image |
| standardWorkingDays | Standard working days per month |
| nationality | Employee nationality |
| professionCode | Profession code |
| profession | Profession name |
| paymentMethod | Payment method |
| transferable | Whether the employee is transferable |
| drivingLicenseNumber | Driving license number |
| drivingLicenseIssueDate | Driving license issue date |
| drivingLicenseExpiryDate | Driving license expiry date |
| drivingLicenseImage | Driving license document image |
| otherDocs | Other documents |
| iban | IBAN |
| swiftCode | Bank SWIFT code |
| residencyName | Residency name |
| residencyOnCompany | Residency on company |
| professionCategory | Profession category |


