import express from "express";
import session from "express-session";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import bcrypt from "bcryptjs";
import createMemoryStore from "memorystore";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { resolveInterFontFilesPath } from "./fontStatic";
import { errorHandler } from "./errorHandler";
import { storage } from "./storage";
import {
  generateExpiryWarningEmail,
  shouldSendAlert,
  sendEmail,
  escalateOverdueNotifications,
} from "./emailService";
import { processVacationReturnAlerts } from "./vacationReturnScheduler";
import { processAttendanceAlerts } from "./attendanceScheduler";
import type { SessionUser, UserWithPermissions } from "@shared/schema";
import { setupChatbotPush } from "./chatbotPush";
import { processScheduledReports } from "./reportScheduler";
import { trackBackgroundJob } from "./metrics";
type AuthUser = SessionUser;

const normalizeMfaMethod = (
  method: string | null | undefined,
): SessionUser["mfa"]["method"] => {
  if (method === "totp" || method === "email_otp") {
    return method;
  }
  return null;
};

const toAuthUser = (user: UserWithPermissions): AuthUser => {
  const { passwordHash, mfaTotpSecret, mfaBackupCodes, ...safe } = user;
  const codes = Array.isArray(mfaBackupCodes) ? mfaBackupCodes : [];
  return {
    ...safe,
    mfa: {
      enabled: safe.mfaEnabled ?? false,
      method: normalizeMfaMethod(safe.mfaMethod),
      backupCodesRemaining: codes.length,
    },
  };
};

declare global {
  namespace Express {
    interface User extends AuthUser {}
  }
}

type AdminSeedConfig = { username: string; password: string; email: string } | undefined;

const resolveAdminSeed = (): AdminSeedConfig => {
  const nodeEnv = process.env.NODE_ENV ?? "development";
  const isProduction = nodeEnv === "production";
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  const email = process.env.ADMIN_EMAIL;

  if (username && password && email) {
    return { username, password, email };
  }

  if (isProduction) {
    return undefined;
  }

  if (!username) {
    log("warning: ADMIN_USERNAME not set; using development default 'admin'");
  }
  if (!password) {
    log("warning: ADMIN_PASSWORD not set; using development default 'admin'");
  }
  if (!email) {
    log("warning: ADMIN_EMAIL not set; using development default 'admin@example.com'");
  }

  return {
    username: username ?? "admin",
    password: password ?? "admin",
    email: email ?? "admin@example.com",
  };
};

const ensureAdminUser = async (): Promise<UserWithPermissions> => {
  const existing = await storage.getFirstActiveAdmin();
  if (existing) {
    return existing;
  }

  const seed = resolveAdminSeed();
  if (!seed) {
    throw new Error(
      "No active admin user exists and ADMIN_USERNAME, ADMIN_PASSWORD, and ADMIN_EMAIL environment variables are not configured",
    );
  }

  const passwordHash = await bcrypt.hash(seed.password, 12);
  const created = await storage.createUser({
    username: seed.username,
    email: seed.email,
    passwordHash,
    role: "admin",
    active: true,
  });
  log(`bootstrap admin user '${seed.username}' created`);
  return created;
};

const adminBootstrap = ensureAdminUser();

passport.use(
  new LocalStrategy(async (username, password, done) => {
    try {
      await adminBootstrap;
    const userRecord = await storage.getUserByUsername(username);
      if (!userRecord || userRecord.active === false) {
        return done(null, false);
      }
      const matches = await bcrypt.compare(password, userRecord.passwordHash);
      if (!matches) {
        return done(null, false);
      }
      return done(null, toAuthUser(userRecord));
    } catch (error) {
      return done(error as Error);
    }
  }),
);

passport.serializeUser((user: Express.User, done) => {
  done(null, (user as AuthUser).id);
});

passport.deserializeUser(async (id: string, done) => {
  try {
    await adminBootstrap;
    const userRecord = await storage.getUserById(id);
    if (!userRecord || userRecord.active === false) {
      return done(null, false);
    }
    return done(null, toAuthUser(userRecord));
  } catch (error) {
    return done(error as Error);
  }
});

const MemoryStore = createMemoryStore(session);

const app = express();
const fontStaticPath = resolveInterFontFilesPath();
if (fontStaticPath) {
  app.use("/files", express.static(fontStaticPath));
} else {
  log("warning: unable to resolve Inter font files directory");
}
app.set("etag", false);

const defaultBodyLimit = process.env.BODY_LIMIT?.trim() || "1mb";
const employeeBodyLimit = process.env.EMPLOYEE_BODY_LIMIT?.trim() || "5mb";

const normalizeContentType = (req: any): string => {
  const header = req?.headers?.["content-type"];
  if (typeof header === "string") {
    return header.toLowerCase();
  }
  if (Array.isArray(header)) {
    return header.join(",").toLowerCase();
  }
  return "";
};

const isEmployeesRequest = (req: any): boolean => {
  const url = typeof req?.url === "string" ? req.url : "";
  return url.startsWith("/api/employees");
};

const matchesMime = (req: any, mime: string): boolean => normalizeContentType(req).includes(mime);

app.use(
  express.json({
    limit: employeeBodyLimit,
    type: (req) => isEmployeesRequest(req) && matchesMime(req, "application/json"),
  }),
);
app.use(
  express.json({
    limit: defaultBodyLimit,
    type: (req) => !isEmployeesRequest(req) && matchesMime(req, "application/json"),
  }),
);
app.use(
  express.urlencoded({
    extended: true,
    limit: employeeBodyLimit,
    type: (req) => isEmployeesRequest(req) && matchesMime(req, "application/x-www-form-urlencoded"),
  }),
);
app.use(
  express.urlencoded({
    extended: true,
    limit: defaultBodyLimit,
    type: (req) => !isEmployeesRequest(req) && matchesMime(req, "application/x-www-form-urlencoded"),
  }),
);
app.use("/api", (_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  const message = "SESSION_SECRET environment variable is required";
  if (app.get("env") === "production") {
    throw new Error(message);
  } else {
    log(`warning: ${message}; using default 'secret'`);
  }
}

const sessionMiddleware = session({
  secret: sessionSecret || "secret",
  resave: false,
  saveUninitialized: false,
  store: new MemoryStore({ checkPeriod: 86400000 }),
});

app.use(sessionMiddleware);

app.use(passport.initialize());
app.use(passport.session());

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    // Log API routes and auth endpoints for better visibility
    if (path.startsWith("/api") || path === "/login" || path === "/logout") {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "...";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await adminBootstrap;
  const server = await registerRoutes(app);

  setupChatbotPush(server, sessionMiddleware);

  app.use(errorHandler);

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  const listenOptions: {
    port: number;
    host?: string;
    reusePort?: boolean;
  } = { port };

  if (process.platform !== "win32") {
    listenOptions.host = "0.0.0.0";
  }

  server.listen(listenOptions, () => {
    log(`serving on port ${port}`);
  });

  // Background: process document expiry alerts on startup and periodically
  const processDocumentExpiryAlerts = async () => {
    try {
      await trackBackgroundJob("document_expiry_alerts", async () => {
        const checks = await storage.checkDocumentExpiries();
        for (const check of checks) {
          const employee = await storage.getEmployee(check.employeeId);
          if (!employee) continue;

          if (check.visa && shouldSendAlert(check.visa.expiryDate, check.visa.alertDays)) {
            const email = generateExpiryWarningEmail(
              employee,
              "visa",
              check.visa.expiryDate,
              check.visa.daysUntilExpiry,
              check.visa.number,
            );
            await storage.createNotification({
              employeeId: check.employeeId,
              type: "visa_expiry",
              title: email.subject,
              message: `Visa expires in ${check.visa.daysUntilExpiry} days`,
              priority: check.visa.daysUntilExpiry <= 7 ? "critical" : check.visa.daysUntilExpiry <= 30 ? "high" : "medium",
              expiryDate: check.visa.expiryDate,
              daysUntilExpiry: check.visa.daysUntilExpiry,
              emailSent: false,
              deliveryChannels: ["email"],
              escalationHistory: [],
            });
            await sendEmail({
              to: employee.email || "",
              from: process.env.FROM_EMAIL || "hr@company.com",
              subject: email.subject,
              html: email.html,
              text: email.text,
            });
          }
          if (check.civilId && shouldSendAlert(check.civilId.expiryDate, check.civilId.alertDays)) {
            const email = generateExpiryWarningEmail(
              employee,
              "civil_id",
              check.civilId.expiryDate,
              check.civilId.daysUntilExpiry,
              check.civilId.number,
            );
            await storage.createNotification({
              employeeId: check.employeeId,
              type: "civil_id_expiry",
              title: email.subject,
              message: `Civil ID expires in ${check.civilId.daysUntilExpiry} days`,
              priority: check.civilId.daysUntilExpiry <= 7 ? "critical" : check.civilId.daysUntilExpiry <= 30 ? "high" : "medium",
              expiryDate: check.civilId.expiryDate,
              daysUntilExpiry: check.civilId.daysUntilExpiry,
              emailSent: false,
              deliveryChannels: ["email"],
              escalationHistory: [],
            });
            await sendEmail({
              to: employee.email || "",
              from: process.env.FROM_EMAIL || "hr@company.com",
              subject: email.subject,
              html: email.html,
              text: email.text,
            });
          }
          if (check.passport && shouldSendAlert(check.passport.expiryDate, check.passport.alertDays)) {
            const email = generateExpiryWarningEmail(
              employee,
              "passport",
              check.passport.expiryDate,
              check.passport.daysUntilExpiry,
              check.passport.number,
            );
            await storage.createNotification({
              employeeId: check.employeeId,
              type: "passport_expiry",
              title: email.subject,
              message: `Passport expires in ${check.passport.daysUntilExpiry} days`,
              priority: check.passport.daysUntilExpiry <= 7 ? "critical" : check.passport.daysUntilExpiry <= 30 ? "high" : "medium",
              expiryDate: check.passport.expiryDate,
              daysUntilExpiry: check.passport.daysUntilExpiry,
              emailSent: false,
              deliveryChannels: ["email"],
              escalationHistory: [],
            });
            await sendEmail({
              to: employee.email || "",
              from: process.env.FROM_EMAIL || "hr@company.com",
              subject: email.subject,
              html: email.html,
              text: email.text,
            });
          }
          if (
            check.drivingLicense &&
            shouldSendAlert(check.drivingLicense.expiryDate, check.drivingLicense.alertDays)
          ) {
            const email = generateExpiryWarningEmail(
              employee,
              "driving_license",
              check.drivingLicense.expiryDate,
              check.drivingLicense.daysUntilExpiry,
              check.drivingLicense.number,
            );
            await storage.createNotification({
              employeeId: check.employeeId,
              type: "driving_license_expiry",
              title: email.subject,
              message: `Driving License expires in ${check.drivingLicense.daysUntilExpiry} days`,
              priority: check.drivingLicense.daysUntilExpiry <= 7 ? "critical" : check.drivingLicense.daysUntilExpiry <= 30 ? "high" : "medium",
              expiryDate: check.drivingLicense.expiryDate,
              daysUntilExpiry: check.drivingLicense.daysUntilExpiry,
              emailSent: false,
              deliveryChannels: ["email"],
              escalationHistory: [],
            });
            await sendEmail({
              to: employee.email || "",
              from: process.env.FROM_EMAIL || "hr@company.com",
              subject: email.subject,
              html: email.html,
              text: email.text,
            });
          }
        }
      });
    } catch (err) {
      log(`warning: failed processing document expiry alerts: ${String(err)}`);
    }
  };

  // Run once after start and then every 12 hours
  processDocumentExpiryAlerts();
  setInterval(processDocumentExpiryAlerts, 12 * 60 * 60 * 1000);

  const runVacationReturnAlerts = async () => {
    try {
      await trackBackgroundJob("vacation_return_alerts", () => processVacationReturnAlerts());
    } catch (err) {
      log(`warning: failed processing vacation return alerts: ${String(err)}`);
    }
  };

  // Run once after start and then every 6 hours to catch return deadlines quickly
  runVacationReturnAlerts();
  setInterval(runVacationReturnAlerts, 6 * 60 * 60 * 1000);

  const runAttendanceAlerts = async () => {
    try {
      await trackBackgroundJob("attendance_alerts", () => processAttendanceAlerts());
    } catch (err) {
      log(`warning: failed processing attendance alerts: ${String(err)}`);
    }
  };

  runAttendanceAlerts();
  setInterval(runAttendanceAlerts, 60 * 60 * 1000);

  let scheduledReportRun: Promise<void> | null = null;

  const runScheduledReports = (): Promise<void> => {
    if (scheduledReportRun) {
      log("info: scheduled report run skipped (already running)");
      return scheduledReportRun;
    }

    scheduledReportRun = (async () => {
      try {
        const processed = await trackBackgroundJob("scheduled_reports", () => processScheduledReports());
        if (processed > 0) {
          const suffix = processed === 1 ? "schedule" : "schedules";
          log(`scheduled report run completed (${processed} ${suffix} processed)`);
        } else {
          log("scheduled report run completed (no schedules due)");
        }
      } catch (err) {
        log(`warning: scheduled report run failed: ${String(err)}`);
      } finally {
        scheduledReportRun = null;
      }
    })();

    return scheduledReportRun;
  };

  runScheduledReports();
  setInterval(() => {
    void runScheduledReports();
  }, 15 * 60 * 1000);

  let notificationEscalationRun: Promise<void> | null = null;

  const runNotificationEscalations = (): Promise<void> => {
    if (notificationEscalationRun) {
      log("info: notification escalation run skipped (already running)");
      return notificationEscalationRun;
    }

    notificationEscalationRun = (async () => {
      try {
        const escalated = await trackBackgroundJob("notification_escalations", () =>
          escalateOverdueNotifications(storage),
        );
        if (escalated > 0) {
          const suffix = escalated === 1 ? "notification" : "notifications";
          log(`notification escalation run escalated ${escalated} ${suffix}`);
        } else {
          log("notification escalation run completed (no escalations due)");
        }
      } catch (err) {
        log(`warning: notification escalation run failed: ${String(err)}`);
      } finally {
        notificationEscalationRun = null;
      }
    })();

    return notificationEscalationRun;
  };

  runNotificationEscalations();
  setInterval(() => {
    void runNotificationEscalations();
  }, 12 * 60 * 1000);
})();
