// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import bcrypt from "bcryptjs";
import { TextEncoder, TextDecoder } from "util";
import { usersRouter } from "./routes/users";
import { errorHandler } from "./errorHandler";

// Ensure TextEncoder/TextDecoder exist for modules that depend on them during Vitest runs.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).TextEncoder = TextEncoder;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).TextDecoder = TextDecoder as unknown as typeof globalThis.TextDecoder;

interface MockUser {
  id: string;
  username: string;
  email: string;
  role: string;
  passwordHash: string;
  active: boolean;
}

const mockData: { users: MockUser[] } = {
  users: [],
};

vi.mock("./storage", () => {
  const store = {
    get users() {
      return mockData.users;
    },
    set users(value: MockUser[]) {
      mockData.users = value;
    },
  };

  const storage = {
    getUsers: vi.fn(async () => [...store.users]),
    getUserById: vi.fn(async (id: string) => store.users.find((u) => u.id === id)),
    getUserByUsername: vi.fn(async (username: string) => store.users.find((u) => u.username === username)),
    createUser: vi.fn(async (user: any) => {
      const created: MockUser = {
        id: user.id ?? `user-${store.users.length + 1}`,
        username: user.username,
        email: user.email,
        role: user.role ?? "viewer",
        active: user.active ?? true,
        passwordHash: user.passwordHash,
      };
      store.users = [...store.users, created];
      return created;
    }),
    updateUser: vi.fn(async (id: string, data: any) => {
      const idx = store.users.findIndex((u) => u.id === id);
      if (idx === -1) return undefined;
      const updated = { ...store.users[idx], ...data } as MockUser;
      const next = [...store.users];
      next[idx] = updated;
      store.users = next;
      return updated;
    }),
    countActiveAdmins: vi.fn(async (excludeId?: string) =>
      store.users.filter((u) => u.role === "admin" && u.active && u.id !== excludeId).length,
    ),
    getFirstActiveAdmin: vi.fn(async () => store.users.find((u) => u.role === "admin" && u.active) ?? undefined),
  };

  return { storage };
});

const { storage } = await import("./storage");

function createApp(role: string = "admin") {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    // @ts-ignore
    req.isAuthenticated = () => true;
    // @ts-ignore
    req.user = { role };
    next();
  });
  app.use("/api/users", usersRouter);
  app.use(errorHandler);
  return app;
}

function resetUsers() {
  mockData.users = [
    {
      id: "admin-1",
      username: "admin",
      email: "admin@example.com",
      role: "admin",
      passwordHash: bcrypt.hashSync("secret", 1),
      active: true,
    },
    {
      id: "viewer-1",
      username: "viewer",
      email: "viewer@example.com",
      role: "viewer",
      passwordHash: bcrypt.hashSync("viewer", 1),
      active: true,
    },
  ];
}

describe("users router", () => {
  beforeEach(() => {
    resetUsers();
    vi.clearAllMocks();
  });

  it("rejects non-admin access", async () => {
    const app = createApp("viewer");
    const res = await request(app).get("/api/users");
    expect(res.status).toBe(403);
  });

  it("lists users without exposing password hashes", async () => {
    const app = createApp();
    const res = await request(app).get("/api/users");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].passwordHash).toBeUndefined();
  });

  it("creates a user with a hashed password", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/api/users")
      .send({ username: "hr-user", email: "hr@example.com", password: "Password1", role: "hr" });
    expect(res.status).toBe(201);
    const call = (storage.createUser as any).mock.calls.at(-1)?.[0];
    expect(call).toBeDefined();
    expect(call.passwordHash).not.toBe("Password1");
    expect(await bcrypt.compare("Password1", call.passwordHash)).toBe(true);
  });

  it("updates user role", async () => {
    const app = createApp();
    const res = await request(app)
      .put("/api/users/viewer-1")
      .send({ role: "hr" });
    expect(res.status).toBe(200);
    expect(res.body.role).toBe("hr");
  });

  it("prevents deactivating the last admin", async () => {
    const app = createApp();
    mockData.users = [
      {
        id: "admin-only",
        username: "only",
        email: "only@example.com",
        role: "admin",
        active: true,
        passwordHash: bcrypt.hashSync("only", 1),
      },
    ];
    const res = await request(app).post("/api/users/admin-only/deactivate");
    expect(res.status).toBe(400);
  });

  it("resets a user password", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/api/users/viewer-1/reset-password")
      .send({ password: "NewPass1" });
    expect(res.status).toBe(200);
    const updateCall = (storage.updateUser as any).mock.calls.find((call: any[]) => call[0] === "viewer-1");
    expect(updateCall).toBeDefined();
    const hashed = updateCall?.[1]?.passwordHash;
    expect(await bcrypt.compare("NewPass1", hashed)).toBe(true);
  });
});
