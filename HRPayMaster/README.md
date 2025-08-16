# HRPayMaster

## Neon Database Setup

1. **Get a connection string**
   - Sign in to the [Neon](https://neon.tech) dashboard and copy the connection string for your project.
2. **Configure environment variables**
   - Create a `.env` file in this directory or add secrets via your hosting platform's UI.
   - Define the following variables:

     ```bash
     DATABASE_URL="<your Neon connection string>"
     SESSION_SECRET="<random session secret>"
     ```

   > [!IMPORTANT]
   > `SESSION_SECRET` must be set in production. The server will refuse to
   > start without it to ensure session data remains secure.

3. **Install dependencies**

   ```bash
   npm install
   ```

4. **Run migrations**

   ```bash
   npm run db:push
   ```

   - Requires the `DATABASE_URL` environment variable.
   - Run this step whenever you pull changes that modify the database schema.

5. **Start the application**
   - Development: `npm run dev`
   - Production: `npm run build` followed by `npm run start`

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


