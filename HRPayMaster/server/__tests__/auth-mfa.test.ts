/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { authRouter } from "../routes/auth";

const {
  authenticateMock,
  createMfaChallengeMock,
  verifyMfaChallengeMock,
} = vi.hoisted(() => ({
  authenticateMock: vi.fn(),
  createMfaChallengeMock: vi.fn(),
  verifyMfaChallengeMock: vi.fn(),
}));

vi.mock("passport", () => ({
  default: { authenticate: authenticateMock },
  authenticate: authenticateMock,
}));

vi.mock("../storage", () => ({
  storage: {
    createMfaChallenge: createMfaChallengeMock,
    verifyMfaChallenge: verifyMfaChallengeMock,
  },
}));

vi.mock("../vite", () => ({
  log: vi.fn(),
}));

describe("auth routes MFA", () => {
  let app: express.Express;
  let nextAuthResponse: { err?: unknown; user?: any };
  let logInSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    nextAuthResponse = { user: undefined };
    authenticateMock.mockReset();
    createMfaChallengeMock.mockReset();
    verifyMfaChallengeMock.mockReset();

    authenticateMock.mockImplementation((_strategy: string, cb: any) => {
      return (_req: express.Request, _res: express.Response, _next: express.NextFunction) => {
        const { err, user } = nextAuthResponse;
        cb(err ?? null, user ?? false);
      };
    });

    app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      logInSpy = vi.fn((_user: unknown, done: any) => done && done(null));
      (req as any).logIn = logInSpy;
      next();
    });
    app.use(authRouter);
  });

  it("logs users in without MFA", async () => {
    const sessionUser = {
      id: "user-1",
      username: "admin",
      role: "admin",
      permissions: [],
      activeGrants: [],
      mfa: { enabled: false, method: null, backupCodesRemaining: 0 },
    };
    nextAuthResponse.user = sessionUser;

    const res = await request(app).post("/login").send({ username: "admin", password: "admin" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ user: sessionUser });
    expect(createMfaChallengeMock).not.toHaveBeenCalled();
    expect(logInSpy).toHaveBeenCalled();
  });

  it("prompts for MFA when enabled", async () => {
    const sessionUser = {
      id: "user-2",
      username: "with-mfa",
      role: "admin",
      permissions: [],
      activeGrants: [],
      mfa: { enabled: true, method: "totp", backupCodesRemaining: 2 },
    };
    const challenge = {
      id: "challenge-1",
      method: "totp" as const,
      expiresAt: new Date("2025-01-01T00:00:00.000Z"),
      deliveryHint: null,
    };
    nextAuthResponse.user = sessionUser;
    createMfaChallengeMock.mockResolvedValue(challenge);

    const res = await request(app).post("/login").send({ username: "with-mfa", password: "secret" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      mfaRequired: true,
      challenge: {
        id: challenge.id,
        method: challenge.method,
        expiresAt: challenge.expiresAt.toISOString(),
        deliveryHint: null,
      },
    });
    expect(createMfaChallengeMock).toHaveBeenCalledWith(sessionUser.id);
    expect(logInSpy).not.toHaveBeenCalled();
  });

  it("returns 400 when MFA payload is invalid", async () => {
    const res = await request(app).post("/login/mfa").send({ challengeId: 123 });

    expect(res.status).toBe(400);
    expect(verifyMfaChallengeMock).not.toHaveBeenCalled();
  });

  it("logs user in after successful MFA verification", async () => {
    const sessionUser = {
      id: "user-3",
      username: "mfa-complete",
      role: "admin",
      permissions: ["payroll:view"],
      activeGrants: [],
      mfa: { enabled: true, method: "totp", backupCodesRemaining: 1 },
    };
    verifyMfaChallengeMock.mockResolvedValue({ success: true, user: sessionUser });

    const res = await request(app)
      .post("/login/mfa")
      .send({ challengeId: "challenge-1", code: "123456" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ user: sessionUser });
    expect(logInSpy).toHaveBeenCalled();
  });

  it("rejects invalid MFA codes", async () => {
    verifyMfaChallengeMock.mockResolvedValue({ success: false, reason: "invalid" });

    const res = await request(app)
      .post("/login/mfa")
      .send({ challengeId: "challenge-1", code: "000000" });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Invalid or expired code" });
  });
});
