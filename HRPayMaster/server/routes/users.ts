import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import type { User } from "@shared/schema";
import { requireRole } from "./auth";
import { storage } from "../storage";
import { HttpError } from "../errorHandler";

const usersRouter = Router();

usersRouter.use(requireRole(["admin"]));

const roleSchema = z.enum(["admin", "hr", "viewer", "employee"]);

const createUserSchema = z.object({
  username: z.string().min(3, "Username is required"),
  email: z.string().email("Valid email is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: roleSchema,
});

const updateUserSchema = z
  .object({
    username: z.string().min(3).optional(),
    email: z.string().email().optional(),
    role: roleSchema.optional(),
    active: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "No updates provided",
  });

const passwordSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const toSafeUser = (user: User) => {
  const { passwordHash, ...safe } = user;
  return safe;
};

const ensureAnotherAdminRemains = async (user: User, updates: { role?: string; active?: boolean }) => {
  if (user.role !== "admin" || user.active === false) {
    return;
  }

  const nextRole = updates.role ?? user.role;
  const nextActive = updates.active ?? user.active;

  if (nextRole === "admin" && nextActive) {
    return;
  }

  const remaining = await storage.countActiveAdmins(user.id);
  if (remaining === 0) {
    throw new HttpError(400, "At least one active admin user is required");
  }
};

usersRouter.get("/", async (_req, res, next) => {
  try {
    const users = await storage.getUsers();
    res.json(users.map(toSafeUser));
  } catch (error) {
    next(error);
  }
});

usersRouter.post("/", async (req, res, next) => {
  try {
    const { username, email, password, role } = createUserSchema.parse(req.body);
    const passwordHash = await bcrypt.hash(password, 12);
    const created = await storage.createUser({
      username,
      email,
      passwordHash,
      role,
      active: true,
    });
    res.status(201).json(toSafeUser(created));
  } catch (error: any) {
    if (error?.code === "23505") {
      next(new HttpError(409, "Username or email already exists"));
      return;
    }
    next(error);
  }
});

usersRouter.put("/:id", async (req, res, next) => {
  try {
    const id = req.params.id;
    const updates = updateUserSchema.parse(req.body);
    const existing = await storage.getUserById(id);
    if (!existing) {
      throw new HttpError(404, "User not found");
    }

    await ensureAnotherAdminRemains(existing, updates);

    if (Object.keys(updates).length === 0) {
      res.json(toSafeUser(existing));
      return;
    }

    const updated = await storage.updateUser(id, updates);
    if (!updated) {
      throw new HttpError(404, "User not found");
    }
    res.json(toSafeUser(updated));
  } catch (error: any) {
    if (error?.code === "23505") {
      next(new HttpError(409, "Username or email already exists"));
      return;
    }
    next(error);
  }
});

usersRouter.post("/:id/reset-password", async (req, res, next) => {
  try {
    const id = req.params.id;
    const { password } = passwordSchema.parse(req.body);
    const existing = await storage.getUserById(id);
    if (!existing) {
      throw new HttpError(404, "User not found");
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const updated = await storage.updateUser(id, { passwordHash });
    if (!updated) {
      throw new HttpError(404, "User not found");
    }
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

usersRouter.post("/:id/deactivate", async (req, res, next) => {
  try {
    const id = req.params.id;
    const existing = await storage.getUserById(id);
    if (!existing) {
      throw new HttpError(404, "User not found");
    }

    if (!existing.active) {
      res.json(toSafeUser(existing));
      return;
    }

    await ensureAnotherAdminRemains(existing, { active: false });

    const updated = await storage.updateUser(id, { active: false });
    if (!updated) {
      throw new HttpError(404, "User not found");
    }
    res.json(toSafeUser(updated));
  } catch (error) {
    next(error);
  }
});

usersRouter.post("/:id/reactivate", async (req, res, next) => {
  try {
    const id = req.params.id;
    const existing = await storage.getUserById(id);
    if (!existing) {
      throw new HttpError(404, "User not found");
    }

    if (existing.active) {
      res.json(toSafeUser(existing));
      return;
    }

    const updated = await storage.updateUser(id, { active: true });
    if (!updated) {
      throw new HttpError(404, "User not found");
    }
    res.json(toSafeUser(updated));
  } catch (error) {
    next(error);
  }
});

export { usersRouter };
