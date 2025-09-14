import { Router } from "express";
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

// Expose /metrics endpoint for Prometheus to scrape
export const metricsRouter = Router();
metricsRouter.get("/metrics", async (_req, res) => {
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
});
