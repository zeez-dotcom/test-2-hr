import express from "express";
import session from "express-session";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import createMemoryStore from "memorystore";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { errorHandler } from "./errorHandler";
import { storage } from "./storage";
import { generateExpiryWarningEmail, shouldSendAlert, sendEmail } from "./emailService";

interface User {
  id: string;
  username: string;
  email: string;
  employeeId?: string;
  role: string;
}

const ADMIN_USER: User = {
  id: "1",
  username: "admin",
  email: "admin1@gmail.com",
  role: "admin",
};
const ADMIN_PASSWORD = "admin";

passport.use(
  new LocalStrategy((username, password, done) => {
    if (
      username === ADMIN_USER.username &&
      password === ADMIN_PASSWORD
    ) {
      return done(null, ADMIN_USER);
    }
    return done(null, false);
  }),
);

passport.serializeUser((user: Express.User, done) => {
  done(null, ADMIN_USER.id);
});

passport.deserializeUser((id: string, done) => {
  if (id === ADMIN_USER.id) {
    return done(null, ADMIN_USER);
  }
  return done(null, false);
});

const MemoryStore = createMemoryStore(session);

const app = express();
app.set("etag", false);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
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

app.use(
  session({
    secret: sessionSecret || "secret",
    resave: false,
    saveUninitialized: false,
    store: new MemoryStore({ checkPeriod: 86400000 }),
  }),
);

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
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

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
      const checks = await storage.checkDocumentExpiries();
      for (const check of checks) {
        const employee = await storage.getEmployee(check.employeeId);
        if (!employee) continue;

        if (check.visa && shouldSendAlert(check.visa.expiryDate, check.visa.alertDays)) {
          const email = generateExpiryWarningEmail(employee, 'visa', check.visa.expiryDate, check.visa.daysUntilExpiry, check.visa.number);
          await storage.createNotification({
            employeeId: check.employeeId,
            type: 'visa_expiry',
            title: email.subject,
            message: `Visa expires in ${check.visa.daysUntilExpiry} days`,
            priority: check.visa.daysUntilExpiry <= 7 ? 'critical' : check.visa.daysUntilExpiry <= 30 ? 'high' : 'medium',
            expiryDate: check.visa.expiryDate,
            daysUntilExpiry: check.visa.daysUntilExpiry,
            emailSent: false,
          });
          await sendEmail({ to: employee.email || '', from: process.env.FROM_EMAIL || 'hr@company.com', subject: email.subject, html: email.html, text: email.text });
        }
        if (check.civilId && shouldSendAlert(check.civilId.expiryDate, check.civilId.alertDays)) {
          const email = generateExpiryWarningEmail(employee, 'civil_id', check.civilId.expiryDate, check.civilId.daysUntilExpiry, check.civilId.number);
          await storage.createNotification({
            employeeId: check.employeeId,
            type: 'civil_id_expiry',
            title: email.subject,
            message: `Civil ID expires in ${check.civilId.daysUntilExpiry} days`,
            priority: check.civilId.daysUntilExpiry <= 7 ? 'critical' : check.civilId.daysUntilExpiry <= 30 ? 'high' : 'medium',
            expiryDate: check.civilId.expiryDate,
            daysUntilExpiry: check.civilId.daysUntilExpiry,
            emailSent: false,
          });
          await sendEmail({ to: employee.email || '', from: process.env.FROM_EMAIL || 'hr@company.com', subject: email.subject, html: email.html, text: email.text });
        }
        if (check.passport && shouldSendAlert(check.passport.expiryDate, check.passport.alertDays)) {
          const email = generateExpiryWarningEmail(employee, 'passport', check.passport.expiryDate, check.passport.daysUntilExpiry, check.passport.number);
          await storage.createNotification({
            employeeId: check.employeeId,
            type: 'passport_expiry',
            title: email.subject,
            message: `Passport expires in ${check.passport.daysUntilExpiry} days`,
            priority: check.passport.daysUntilExpiry <= 7 ? 'critical' : check.passport.daysUntilExpiry <= 30 ? 'high' : 'medium',
            expiryDate: check.passport.expiryDate,
            daysUntilExpiry: check.passport.daysUntilExpiry,
            emailSent: false,
          });
          await sendEmail({ to: employee.email || '', from: process.env.FROM_EMAIL || 'hr@company.com', subject: email.subject, html: email.html, text: email.text });
        }
        if (check.drivingLicense && shouldSendAlert(check.drivingLicense.expiryDate, check.drivingLicense.alertDays)) {
          const email = generateExpiryWarningEmail(employee, 'driving_license', check.drivingLicense.expiryDate, check.drivingLicense.daysUntilExpiry, check.drivingLicense.number);
          await storage.createNotification({
            employeeId: check.employeeId,
            type: 'driving_license_expiry',
            title: email.subject,
            message: `Driving License expires in ${check.drivingLicense.daysUntilExpiry} days`,
            priority: check.drivingLicense.daysUntilExpiry <= 7 ? 'critical' : check.drivingLicense.daysUntilExpiry <= 30 ? 'high' : 'medium',
            expiryDate: check.drivingLicense.expiryDate,
            daysUntilExpiry: check.drivingLicense.daysUntilExpiry,
            emailSent: false,
          });
          await sendEmail({ to: employee.email || '', from: process.env.FROM_EMAIL || 'hr@company.com', subject: email.subject, html: email.html, text: email.text });
        }
      }
    } catch (err) {
      log(`warning: failed processing document expiry alerts: ${String(err)}`);
    }
  };

  // Run once after start and then every 12 hours
  processDocumentExpiryAlerts();
  setInterval(processDocumentExpiryAlerts, 12 * 60 * 60 * 1000);
})();
