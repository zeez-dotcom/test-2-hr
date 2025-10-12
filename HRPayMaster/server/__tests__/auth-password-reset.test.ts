/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { authRouter } from "../routes/auth";

const {
  getUserByEmailMock,
  createPasswordResetTokenMock,
  resetPasswordWithTokenMock,
  sendPasswordResetEmailMock,
  logMock,
} = vi.hoisted(() => ({
  getUserByEmailMock: vi.fn(),
  createPasswordResetTokenMock: vi.fn(),
  resetPasswordWithTokenMock: vi.fn(),
  sendPasswordResetEmailMock: vi.fn(),
  logMock: vi.fn(),
}));

vi.mock("../storage", () => ({
  storage: {
    getUserByEmail: getUserByEmailMock,
    createPasswordResetToken: createPasswordResetTokenMock,
    resetPasswordWithToken: resetPasswordWithTokenMock,
  },
}));

vi.mock("../emailService", () => ({
  sendPasswordResetEmail: sendPasswordResetEmailMock,
}));

vi.mock("../vite", () => ({
  log: logMock,
}));

describe("password reset routes", () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use(authRouter);

    getUserByEmailMock.mockReset();
    createPasswordResetTokenMock.mockReset();
    resetPasswordWithTokenMock.mockReset();
    sendPasswordResetEmailMock.mockReset();
    logMock.mockReset();
    process.env.API_BASE_URL = "http://localhost:5000";
  });

  it("rejects invalid email payloads", async () => {
    const res = await request(app).post("/forgot-password").send({ email: "not-an-email" });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "A valid email address is required" });
    expect(getUserByEmailMock).not.toHaveBeenCalled();
  });

  it("issues reset token and email when user exists", async () => {
    const expiresAt = new Date("2030-01-01T00:00:00.000Z");
    getUserByEmailMock.mockResolvedValue({
      id: "user-1",
      email: "test@example.com",
      username: "test-user",
      active: true,
    });
    createPasswordResetTokenMock.mockResolvedValue({ token: "abc123", expiresAt });
    sendPasswordResetEmailMock.mockResolvedValue(true);

    const res = await request(app)
      .post("/forgot-password")
      .send({ email: "Test@example.com" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(getUserByEmailMock).toHaveBeenCalledWith("test@example.com");
    expect(createPasswordResetTokenMock).toHaveBeenCalledWith("user-1");
    expect(sendPasswordResetEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "test@example.com",
        username: "test-user",
        expiresAt,
        resetUrl: expect.stringContaining("/reset-password?token=abc123"),
      }),
    );
  });

  it("does not disclose missing accounts", async () => {
    getUserByEmailMock.mockResolvedValue(undefined);

    const res = await request(app)
      .post("/forgot-password")
      .send({ email: "missing@example.com" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(createPasswordResetTokenMock).not.toHaveBeenCalled();
    expect(sendPasswordResetEmailMock).not.toHaveBeenCalled();
  });

  it("resets password when token is valid", async () => {
    resetPasswordWithTokenMock.mockResolvedValue({ success: true });

    const res = await request(app)
      .post("/reset-password")
      .send({ token: "validtoken123", password: "Password1" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(resetPasswordWithTokenMock).toHaveBeenCalled();
    const call = resetPasswordWithTokenMock.mock.calls[0];
    expect(call[0]).toBe("validtoken123");
    expect(call[1]).toEqual(expect.any(String));
  });

  it("returns 410 when token is expired", async () => {
    resetPasswordWithTokenMock.mockResolvedValue({ success: false, reason: "expired" });

    const res = await request(app)
      .post("/reset-password")
      .send({ token: "expiredtoken", password: "Password1" });

    expect(res.status).toBe(410);
    expect(res.body).toEqual({ error: "Invalid or expired reset link" });
  });

  it("returns 400 when token is invalid", async () => {
    resetPasswordWithTokenMock.mockResolvedValue({ success: false, reason: "invalid" });

    const res = await request(app)
      .post("/reset-password")
      .send({ token: "invalidtoken", password: "Password1" });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Invalid or expired reset link" });
  });
});
