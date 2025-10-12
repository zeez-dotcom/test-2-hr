import { Router, type Request, type Response, type NextFunction } from "express";
import { log } from "../vite";
import passport from "passport";
import { HttpError } from "../errorHandler";
import type { PermissionKey, SessionUser } from "@shared/schema";
import { storage } from "../storage";

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
    async (err: unknown, user: Express.User | false) => {
      if (err) return next(err);
      if (!user) return res.status(401).json({ error: "Invalid credentials" });

      const sessionUser = user as SessionUser;
      try {
        if (sessionUser?.mfa?.enabled && sessionUser?.mfa?.method) {
          const challenge = await storage.createMfaChallenge(sessionUser.id);
          if (challenge) {
            return res.json({
              mfaRequired: true,
              challenge: {
                id: challenge.id,
                method: challenge.method,
                expiresAt: challenge.expiresAt.toISOString(),
                deliveryHint: challenge.deliveryHint ?? null,
              },
            });
          }
        }
      } catch (challengeError) {
        return next(challengeError);
      }

      req.logIn(user, (loginErr: unknown) => {
        if (loginErr) return next(loginErr);
        res.json({ user: sessionUser });
      });
    },
  )(req, res, next);
});

authRouter.post("/login/mfa", async (req, res, next) => {
  const { challengeId, code } = req.body ?? {};
  if (typeof challengeId !== "string" || typeof code !== "string") {
    return res.status(400).json({ error: "challengeId and code are required" });
  }
  try {
    const result = await storage.verifyMfaChallenge(challengeId, code);
    if (!result.success || !result.user) {
      const status = result.reason === "expired" ? 410 : 401;
      return res.status(status).json({ error: "Invalid or expired code" });
    }
    req.logIn(result.user, (err: unknown) => {
      if (err) return next(err);
      res.json({ user: result.user });
    });
  } catch (error) {
    next(error);
  }
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

const hasAllPermissions = (user: SessionUser, permissions: PermissionKey[]): boolean => {
  if (permissions.length === 0) return false;
  return permissions.every(permission => user.permissions.includes(permission));
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
  const allowedByPermission = permissions.length > 0 && hasAllPermissions(user, permissions);

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


