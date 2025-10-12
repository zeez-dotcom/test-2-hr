/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { sendEmailMock, generateNumericOtpMock } = vi.hoisted(() => ({
  sendEmailMock: vi.fn().mockResolvedValue(true),
  generateNumericOtpMock: vi.fn().mockReturnValue("654321"),
}));

vi.mock("../db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn(),
    query: {},
  },
}));

vi.mock("../emailService", () => ({
  sendEmail: sendEmailMock,
}));

vi.mock("../utils/mfa", () => ({
  generateNumericOtp: generateNumericOtpMock,
  verifyTotpCode: vi.fn(),
}));

import { DatabaseStorage } from "../storage";

describe("DatabaseStorage createMfaChallenge", () => {
  let storage: DatabaseStorage;

  beforeEach(() => {
    sendEmailMock.mockClear();
    generateNumericOtpMock.mockClear();
    delete process.env.FROM_EMAIL;
    storage = new DatabaseStorage();
    (storage as any).getUserById = vi.fn().mockResolvedValue({
      id: "user-1",
      username: "example",
      email: "user@example.com",
      role: "admin",
      active: true,
      mfaEnabled: true,
      mfaMethod: "email_otp",
      mfaBackupCodes: [],
      permissions: [],
      activeGrants: [],
    });
  });

  it("sends an email OTP challenge when method is email_otp", async () => {
    const challenge = await storage.createMfaChallenge("user-1");

    expect(challenge).toBeDefined();
    expect(challenge?.method).toBe("email_otp");
    expect(challenge?.deliveryHint).toBe("u***@example.com");
    expect(generateNumericOtpMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock).toHaveBeenCalledWith({
      to: "user@example.com",
      from: "hr@company.com",
      subject: "Your verification code",
      text: "Your verification code is 654321. It expires in 5 minutes.",
      html: "<p>Your verification code is 654321. It expires in 5 minutes.</p>",
    });
  });
});
