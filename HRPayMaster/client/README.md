# Client

## Chatbot Monthly Summary Endpoint

The client uses a dedicated endpoint to fetch a payroll summary for the current month.

```
GET /api/chatbot/monthly-summary/:employeeId
```

This route returns the employee's gross and net payroll totals for the month, the outstanding loan balance, and any payroll-affecting events during the period.

> **Authentication**
> The request requires an authenticated session with a user role of `admin`, `hr`, or `employee`.

