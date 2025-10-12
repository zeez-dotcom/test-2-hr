# Observability

## Metrics

### HTTP request metrics

#### `chatbot_monthly_summary_requests_total`
Counts the number of requests made to the `/api/chatbot/monthly-summary/:employeeId` endpoint. The metric is labeled with `status` which is either `success` or `error`.

Use this metric to monitor chatbot monthly summary request volume and error rates.

#### `payroll_preview_requests_total` & `payroll_preview_duration_seconds`
Track `/api/payroll/preview` usage and latency. The counter is labeled with `status` and `method` while the histogram records request duration across the same labels.

These metrics help spot preview spikes or high error/latency rates that slow down payroll simulations.

#### `payroll_generate_requests_total` & `payroll_generate_duration_seconds`
Monitor `/api/payroll/generate` requests. Labels mirror the preview metrics so you can alert on failing payroll generation attempts or slow runtimes.

#### `loan_requests_total` & `loan_request_duration_seconds`
Count and time loan API calls grouped by an `operation` label (`list`, `detail`, `statement`, `create`, `update`, `delete`). This pairing provides visibility into loan CRUD health and helps highlight which operations degrade or fail.

#### `attendance_schedule_requests_total` & `attendance_schedule_duration_seconds`
Measure attendance schedule endpoints, grouped by `operation` (`list`, `create`, `update`, `delete`, `approval`). These metrics detect scheduler bottlenecks or validation issues affecting shift planning.

### Background job metrics

#### `background_job_runs_total`
Counts scheduler executions by `job` (e.g., `document_expiry_alerts`, `vacation_return_alerts`, `attendance_alerts`, `scheduled_reports`, `notification_escalations`) and `status` (`success` or `error`).

#### `background_job_duration_seconds`
Histogram of job runtimes by `job`. Use this to track trends and regressions for recurring automation.

## Recommended alerts

- Payroll preview/generate failures: alert when the ratio of `status="500"` responses to total exceeds 5% over 5 minutes.
- Payroll preview/generate latency: alert when the 95th percentile of `*_duration_seconds` exceeds 10 seconds for 10 minutes.
- Loan and attendance schedules: alert when `loan_requests_total` or `attendance_schedule_requests_total` show consecutive failures (`status` ≥ 400) for a given `operation`.
- Background jobs: alert when `background_job_runs_total{status="error"}` increases for any job, or when `background_job_duration_seconds` exceeds usual baselines (e.g., P95 doubling week over week).
