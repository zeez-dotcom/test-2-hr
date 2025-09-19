import { Router, type Request, type Response, type NextFunction } from "express";
import { log } from "../vite";
import passport from "passport";
import { HttpError } from "../errorHandler";

export const authRouter = Router();

authRouter.post("/login", (req, res, next) => {
  if (process.env.NODE_ENV !== "production") {
    try {
      const u = (req as any)?.body?.username ?? "(missing)";
      log(`login attempt: ${u}`);
    } catch {
      // ignore logging errors
    }
  }
  passport.authenticate(
    "local",
    (err: unknown, user: Express.User | false, info: unknown) => {
      if (err) return next(err);
      if (!user) return res.status(401).json({ error: "Invalid credentials" });
      req.logIn(user, (err: unknown) => {
        if (err) return next(err);
        res.json({ user });
      });
    },
  )(req, res, next);
});

authRouter.post("/logout", (req, res, next) => {
  req.logout((err: unknown) => {
    if (err) return next(err);
    res.json({ ok: true });
  });
});

export const ensureAuth = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (req.isAuthenticated()) return next();

  const body: { error: { message: string; status?: number } } = {
    error: { message: "Unauthorized" },
  };

  if (process.env.NODE_ENV !== "production") {
    body.error.status = 401;
  }

  return res.status(401).json(body);
};

export const requireRole = (roles: string[]) => (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const user = req.user as Express.User & { role?: string };
  if (req.isAuthenticated() && user?.role && roles.includes(user.role)) {
    return next();
  }
  next(new HttpError(403, "Forbidden"));
};

authRouter.get("/api/me", ensureAuth, (req, res) => {
  res.json(req.user);
});


