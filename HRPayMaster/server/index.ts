import express from "express";
import session from "express-session";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import createMemoryStore from "memorystore";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { errorHandler } from "./errorHandler";

interface User {
  id: string;
  username: string;
  email: string;
  employeeId?: string;
}

const ADMIN_USER: User = {
  id: "1",
  username: "admin",
  email: "admin@example.com",
};
const ADMIN_PASSWORD = "admin123";

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
    if (path.startsWith("/api")) {
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
    listenOptions.reusePort = true;
  }

  server.listen(listenOptions, () => {
    log(`serving on port ${port}`);
  });
})();
