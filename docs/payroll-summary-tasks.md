# Payroll Summary Enhancements

## Issues
1. **Session overview omits allowances and bonuses, so finance can't reconcile totals with the entry grid.** The summary cards and descriptive paragraph in `payroll-details-view.tsx` only surface gross, net, deductions, and employee count even though each entry includes a detailed allowance breakdown and bonus amount, leaving out key figures that the business expects to monitor at the run level.【F:HRPayMaster/client/src/components/payroll/payroll-details-view.tsx†L192-L288】
2. **Payroll runs do not store or compute aggregate allowance/bonus totals.** Recalculation only updates `grossAmount`, `totalDeductions`, and `netAmount` on the run record, and `calculateTotals` returns the same trio, so there is no canonical source for run-level allowance or bonus sums to drive the summary UI or exports.【F:HRPayMaster/server/routes/payroll.ts†L768-L840】【F:HRPayMaster/server/utils/payroll.ts†L311-L347】
3. **Existing hydration logic cannot backfill allowance totals for legacy runs.** The UI depends on `storage.getPayrollRun` to materialize entries; without a stored aggregate, any summary would need a derived fallback when the new columns are null so older runs remain viewable without migration gaps.【F:HRPayMaster/server/storage.ts†L1020-L1168】

## Tasks

:::task-stub{title="Persist allowance and bonus totals on payroll runs"}
1. Create a migration under `HRPayMaster/migrations/` and extend `payrollRuns` in `shared/schema.ts` to add numeric columns such as `totalAllowances` and `totalBonuses` (precision/scale consistent with existing payroll fields).
2. Update `calculateTotals` in `server/utils/payroll.ts` (or introduce a companion helper) to sum allowances and bonuses across `EmployeePayroll` entries, returning the new totals alongside gross/deductions/net.
3. Ensure both the generate and recalculate paths in `server/routes/payroll.ts` persist the aggregated allowance/bonus values on the run record, honoring scenario toggles (store `0` when allowances/bonuses are disabled).
4. Adjust storage hydration (`server/storage.ts`) so API consumers receive the new fields, and add server-side tests under `server/__tests__/` covering runs with allowances disabled/enabled to confirm totals remain accurate.
:::

:::task-stub{title="Expose allowance/bonus totals in the UI payroll summary"}
1. Extend the client payroll run query types to include the new aggregate fields and provide a fallback that derives totals from entry data when the server value is `null` (legacy runs).
2. Update `client/src/components/payroll/payroll-details-view.tsx` to surface allowance and bonus totals in the session overview cards/paragraph, ensuring formatting aligns with existing currency helpers.
3. Add Vitest coverage (e.g., `client/src/components/payroll/__tests__/payroll-details-view.test.tsx`) that renders the component with both server-supplied and fallback totals to verify the summary matches the entry grid.
4. If exports, receipts, or downstream summaries consume `payrollRun` totals, adjust any affected serializers to include the allowance/bonus aggregates so PDFs/XLSX stay consistent.
:::
