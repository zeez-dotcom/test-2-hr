/** @vitest-environment node */
import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";
import * as crypto from "node:crypto";
import { passwordResetTokens, users } from "@shared/schema";
import { storage } from "../storage";

const { transactionMock } = vi.hoisted(() => ({
  transactionMock: vi.fn(),
}));

vi.mock("../db", () => ({
  db: {
    transaction: transactionMock,
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    query: {},
  },
}));

describe("storage password reset helpers", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("createPasswordResetToken", () => {
    beforeEach(() => {
      transactionMock.mockReset();
    });

    it("creates a hashed token and invalidates previous ones", async () => {
      const inserted: any[] = [];
      const updates: any[] = [];
      transactionMock.mockImplementation(async (cb) => {
        const tx = {
          update: (table: unknown) => ({
            set: (values: any) => ({
              where: async () => {
                updates.push({ table, values });
              },
            }),
          }),
          insert: (table: unknown) => ({
            values: async (value: any) => {
              inserted.push({ table, value });
            },
          }),
        } as any;
        return cb(tx);
      });

      vi.useFakeTimers();
      vi.setSystemTime(new Date("2024-01-01T00:00:00.000Z"));
      const { token, expiresAt } = await storage.createPasswordResetToken("user-123");

      expect(token).toHaveLength(64);
      expect(expiresAt.toISOString()).toBe("2024-01-01T01:00:00.000Z");

      expect(updates).toHaveLength(1);
      expect(updates[0].table).toBe(passwordResetTokens);
      expect(updates[0].values.consumedAt).toBeInstanceOf(Date);

      expect(inserted).toHaveLength(1);
      expect(inserted[0].table).toBe(passwordResetTokens);
      expect(inserted[0].value.userId).toBe("user-123");
      expect(inserted[0].value.expiresAt).toEqual(expiresAt);

      const expectedHash = crypto.createHash("sha256").update(token).digest("hex");
      expect(inserted[0].value.tokenHash).toBe(expectedHash);
    });
  });

  describe("resetPasswordWithToken", () => {
    let tokenRecord: any;
    let tokenUpdates: any[];
    let userUpdates: any[];

    beforeEach(() => {
      transactionMock.mockReset();
      tokenUpdates = [];
      userUpdates = [];
      tokenRecord = undefined;
    });

    function stubTransaction() {
      transactionMock.mockImplementation(async (cb) => {
        const tx = {
          select: () => ({
            from: (table: unknown) => ({
              where: async () => {
                if (table === passwordResetTokens) {
                  return tokenRecord ? [tokenRecord] : [];
                }
                return [];
              },
            }),
          }),
          update: (table: unknown) => ({
            set: (values: any) => ({
              where: async () => {
                if (table === passwordResetTokens) {
                  tokenUpdates.push(values);
                  if (tokenRecord) {
                    tokenRecord = { ...tokenRecord, ...values };
                  }
                } else if (table === users) {
                  userUpdates.push(values);
                }
              },
            }),
          }),
          insert: () => ({ values: async () => {} }),
        } as any;
        return cb(tx);
      });
    }

    it("returns success and updates password", async () => {
      const rawToken = "token-value";
      tokenRecord = {
        id: "reset-1",
        userId: "user-1",
        tokenHash: crypto.createHash("sha256").update(rawToken).digest("hex"),
        expiresAt: new Date(Date.now() + 10_000),
        consumedAt: null,
      };
      stubTransaction();

      const result = await storage.resetPasswordWithToken(rawToken, "hashed-password");

      expect(result).toEqual({ success: true });
      expect(userUpdates).toHaveLength(1);
      expect(userUpdates[0]).toEqual({ passwordHash: "hashed-password" });
      expect(tokenUpdates.some(update => update.consumedAt instanceof Date)).toBe(true);
    });

    it("fails when token is expired", async () => {
      const rawToken = "expired-token";
      tokenRecord = {
        id: "reset-2",
        userId: "user-1",
        tokenHash: crypto.createHash("sha256").update(rawToken).digest("hex"),
        expiresAt: new Date(Date.now() - 1_000),
        consumedAt: null,
      };
      stubTransaction();

      const result = await storage.resetPasswordWithToken(rawToken, "hashed-password");

      expect(result).toEqual({ success: false, reason: "expired" });
      expect(userUpdates).toHaveLength(0);
      expect(tokenUpdates).toHaveLength(1);
    });

    it("fails when token is missing", async () => {
      tokenRecord = undefined;
      stubTransaction();

      const result = await storage.resetPasswordWithToken("missing", "hashed-password");

      expect(result).toEqual({ success: false, reason: "invalid" });
    });
  });
});
