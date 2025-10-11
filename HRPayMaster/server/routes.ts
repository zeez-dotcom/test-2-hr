import type { Express } from "express";
import { createServer, type Server } from "http";
import { authRouter, ensureAuth } from "./routes/auth";
import { employeesRouter } from "./routes/employees";
import { reportsRouter } from "./routes/reports";
import { payrollRouter } from "./routes/payroll";
import { loansRouter } from "./routes/loans";
import { carsRouter } from "./routes/cars";
import { chatbotRouter } from "./routes/chatbot";
import { metricsRouter } from "./metrics";
import { templatesRouter } from "./routes/templates";
import { usersRouter } from "./routes/users";

export async function registerRoutes(app: Express): Promise<Server> {
  app.get("/healthz", (_req, res) => {
    res.json({ ok: true });
  });
  app.use(authRouter);
  app.use(metricsRouter);
  app.use("/api", ensureAuth);
  app.use("/api/users", usersRouter);
  app.use(employeesRouter);
  app.use(reportsRouter);
  app.use("/api/payroll", payrollRouter);
  app.use("/api/loans", loansRouter);
  app.use("/api/cars", carsRouter);
  app.use(templatesRouter);
  app.use(chatbotRouter);
  const httpServer = createServer(app);
  return httpServer;
}
