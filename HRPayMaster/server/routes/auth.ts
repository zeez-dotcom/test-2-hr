import { Router, type Request, type Response, type NextFunction } from "express";
import { log } from "../vite";
import passport from "passport";
import { HttpError } from "../errorHandler";
import type { PermissionKey, SessionUser } from "@shared/schema";

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

type AccessPolicy = {
  roles?: string[];
  permissions?: PermissionKey | PermissionKey[];
};

const normalizePermissions = (
  permissions?: PermissionKey | PermissionKey[],
): PermissionKey[] => {
  if (!permissions) return [];
  return Array.isArray(permissions) ? permissions : [permissions];
};

const hasAnyPermission = (user: SessionUser, permissions: PermissionKey[]): boolean => {
  if (permissions.length === 0) return false;
  return permissions.some(permission => user.permissions.includes(permission));
};

export const requireAccess = (policy: AccessPolicy) => (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  if (!req.isAuthenticated()) {
    return next(new HttpError(403, "Forbidden"));
  }
  const user = req.user as SessionUser | undefined;
  if (!user) {
    return next(new HttpError(403, "Forbidden"));
  }

  const roles = policy.roles ?? [];
  const permissions = normalizePermissions(policy.permissions);
  const allowedByRole = roles.length > 0 && roles.includes(user.role);
  const allowedByPermission = permissions.length > 0 && hasAnyPermission(user, permissions);

  if (
    (roles.length === 0 && permissions.length === 0) ||
    allowedByRole ||
    allowedByPermission
  ) {
    return next();
  }

  next(new HttpError(403, "Forbidden"));
};

export const requireRole = (roles: string[]) => requireAccess({ roles });

export const requirePermission = (permissions: PermissionKey | PermissionKey[]) =>
  requireAccess({ permissions });

authRouter.get("/api/me", ensureAuth, (req, res) => {
  res.json(req.user);
});


