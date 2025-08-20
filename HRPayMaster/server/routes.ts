import type { Express } from "express";
import { createServer, type Server } from "http";
import { authRouter, ensureAuth } from "./routes/auth";
import { employeesRouter } from "./routes/employees";
import { reportsRouter } from "./routes/reports";
import { payrollRouter } from "./routes/payroll";
import { loansRouter } from "./routes/loans";
import { carsRouter } from "./routes/cars";

export async function registerRoutes(app: Express): Promise<Server> {
  app.use(authRouter);
  app.use("/api", ensureAuth);
  app.use(employeesRouter);
  app.use(reportsRouter);
  app.use("/api/payroll", payrollRouter);
  app.use("/api/loans", loansRouter);
  app.use("/api/cars", carsRouter);
  const httpServer = createServer(app);
  return httpServer;
}

