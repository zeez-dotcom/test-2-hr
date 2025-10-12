import { Router, type Request, type Response, type NextFunction } from "express";
import { log } from "../vite";
import passport from "passport";
import { HttpError } from "../errorHandler";
import type { PermissionKey, SessionUser } from "@shared/schema";
import { storage } from "../storage";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { sendPasswordResetEmail } from "../emailService";

export const authRouter = Router();

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  token: z.string().min(10),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const resolveResetBaseUrl = (req: Request): string => {
  const envUrl =
    process.env.PASSWORD_RESET_URL ||
    process.env.APP_BASE_URL ||
    process.env.API_BASE_URL;
  if (envUrl) return envUrl;
  const host = req.get("host");
  if (host) {
    return `${req.protocol}://${host}`;
  }
  const port = process.env.PORT ?? "5000";
  return `${req.protocol}://localhost:${port}`;
};

const buildResetUrl = (req: Request, token: string): string => {
  const base = resolveResetBaseUrl(req);
  const url = new URL(`/reset-password?token=${encodeURIComponent(token)}`, base);
  return url.toString();
};

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

authRouter.post("/forgot-password", async (req, res, next) => {
  try {
    const { email } = forgotPasswordSchema.parse(req.body ?? {});
    const normalized = email.trim().toLowerCase();
    const user = await storage.getUserByEmail(normalized);

    if (user && user.active !== false) {
      const { token, expiresAt } = await storage.createPasswordResetToken(user.id);
      const resetUrl = buildResetUrl(req, token);
      try {
        await sendPasswordResetEmail({
          to: user.email,
          resetUrl,
          expiresAt,
          username: user.username,
        });
      } catch (emailError) {
        log(`password reset email failed for ${user.id}: ${String(emailError)}`);
      }
    }

    res.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "A valid email address is required" });
    }
    next(error);
  }
});

authRouter.post("/reset-password", async (req, res, next) => {
  try {
    const { token, password } = resetPasswordSchema.parse(req.body ?? {});
    const passwordHash = await bcrypt.hash(password, 12);
    const result = await storage.resetPasswordWithToken(token, passwordHash);

    if (!result.success) {
      const status = result.reason === "expired" ? 410 : 400;
      return res.status(status).json({ error: "Invalid or expired reset link" });
    }

    res.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const first = error.errors?.[0]?.message;
      return res.status(400).json({ error: first ?? "Invalid request" });
    }
    next(error);
  }
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


