import { Router, type Request, type Response, type NextFunction } from "express";
import client from "prom-client";

// Create a Registry which registers the metrics
export const register = new client.Registry();

// Collect default metrics (CPU, memory, etc.)
client.collectDefaultMetrics({ register });

// Custom counter for chatbot monthly summary requests
export const chatbotMonthlySummaryRequestsTotal = new client.Counter({
  name: "chatbot_monthly_summary_requests_total",
  help: "Total number of chatbot monthly summary requests",
  labelNames: ["status"],
  registers: [register],
});

const DEFAULT_LATENCY_BUCKETS = [0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 120];

export const payrollPreviewRequestsTotal = new client.Counter({
  name: "payroll_preview_requests_total",
  help: "Total number of payroll preview requests",
  labelNames: ["status", "method"],
  registers: [register],
});

export const payrollPreviewDurationSeconds = new client.Histogram({
  name: "payroll_preview_duration_seconds",
  help: "Duration of payroll preview requests in seconds",
  labelNames: ["status", "method"],
  buckets: DEFAULT_LATENCY_BUCKETS,
  registers: [register],
});

export const payrollGenerateRequestsTotal = new client.Counter({
  name: "payroll_generate_requests_total",
  help: "Total number of payroll generate requests",
  labelNames: ["status", "method"],
  registers: [register],
});

export const payrollGenerateDurationSeconds = new client.Histogram({
  name: "payroll_generate_duration_seconds",
  help: "Duration of payroll generate requests in seconds",
  labelNames: ["status", "method"],
  buckets: DEFAULT_LATENCY_BUCKETS,
  registers: [register],
});

export const loanRequestsTotal = new client.Counter({
  name: "loan_requests_total",
  help: "Total number of loan API requests partitioned by operation",
  labelNames: ["status", "operation"],
  registers: [register],
});

export const loanRequestDurationSeconds = new client.Histogram({
  name: "loan_request_duration_seconds",
  help: "Duration of loan API requests in seconds",
  labelNames: ["status", "operation"],
  buckets: DEFAULT_LATENCY_BUCKETS,
  registers: [register],
});

export const attendanceScheduleRequestsTotal = new client.Counter({
  name: "attendance_schedule_requests_total",
  help: "Total number of attendance schedule requests partitioned by operation",
  labelNames: ["status", "operation"],
  registers: [register],
});

export const attendanceScheduleDurationSeconds = new client.Histogram({
  name: "attendance_schedule_duration_seconds",
  help: "Duration of attendance schedule requests in seconds",
  labelNames: ["status", "operation"],
  buckets: DEFAULT_LATENCY_BUCKETS,
  registers: [register],
});

export const backgroundJobRunsTotal = new client.Counter({
  name: "background_job_runs_total",
  help: "Total number of background job executions partitioned by status",
  labelNames: ["job", "status"],
  registers: [register],
});

export const backgroundJobDurationSeconds = new client.Histogram({
  name: "background_job_duration_seconds",
  help: "Duration of background job executions in seconds",
  labelNames: ["job"],
  buckets: DEFAULT_LATENCY_BUCKETS,
  registers: [register],
});

type LabelValue = string | number;
type MetricLabels = Record<string, LabelValue>;

type LabelResolver = (req: Request, res: Response) => MetricLabels;

export function createRouteMetricsMiddleware({
  counter,
  histogram,
  labels,
  resolveLabels,
}: {
  counter: client.Counter<string>;
  histogram: client.Histogram<string>;
  labels?: MetricLabels;
  resolveLabels?: LabelResolver;
}): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    const endTimer = histogram.startTimer();
    res.on("finish", () => {
      const dynamicLabels = resolveLabels ? resolveLabels(req, res) : {};
      const observedLabels: MetricLabels = {
        ...(labels ?? {}),
        ...dynamicLabels,
        status: String(res.statusCode),
      };
      counter.inc(observedLabels as client.LabelValues<string>);
      endTimer(observedLabels as client.LabelValues<string>);
    });
    next();
  };
}

export async function trackBackgroundJob<T>(
  job: string,
  run: () => Promise<T>,
): Promise<T> {
  const endTimer = backgroundJobDurationSeconds.startTimer({ job });
  try {
    const result = await run();
    backgroundJobRunsTotal.inc({ job, status: "success" });
    return result;
  } catch (error) {
    backgroundJobRunsTotal.inc({ job, status: "error" });
    throw error;
  } finally {
    endTimer();
  }
}

// Expose /metrics endpoint for Prometheus to scrape
export const metricsRouter = Router();
metricsRouter.get("/metrics", async (_req, res) => {
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
});
