# Performance Benchmarks

The table below compares a sequential query approach against the new batched transaction used by `getMonthlyEmployeeSummary`.

| Method | 100 iterations | Notes |
|--------|---------------|-------|
| Sequential queries | 1583ms | Each query awaited individually |
| Single transaction with `Promise.all` | 524ms | Queries executed in parallel within one transaction |

These measurements were gathered using a simple `setTimeout`-based simulation to mimic I/O latency and demonstrate the relative improvement.
