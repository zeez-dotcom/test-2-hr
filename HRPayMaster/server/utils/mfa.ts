import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import type { MfaMethod } from "@shared/schema";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

const normalizeSecret = (secret: string): string => secret.replace(/\s+/g, "").toUpperCase();

const base32ToBuffer = (secret: string): Buffer => {
  const clean = normalizeSecret(secret).replace(/[^A-Z2-7]/g, "");
  if (!clean) return Buffer.alloc(0);
  let bits = "";
  for (const char of clean) {
    const value = BASE32_ALPHABET.indexOf(char);
    if (value === -1) continue;
    bits += value.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
};

const mod = (input: number, divisor: number): number => ((input % divisor) + divisor) % divisor;

export const generateTotpCode = (
  secret: string,
  options: { timestamp?: number; step?: number; digits?: number } = {},
): string => {
  const key = base32ToBuffer(secret);
  if (key.length === 0) {
    throw new Error("Invalid TOTP secret");
  }
  const timestamp = options.timestamp ?? Date.now();
  const stepSeconds = options.step ?? 30;
  const digits = options.digits ?? 6;
  const counter = Math.floor(timestamp / 1000 / stepSeconds);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(mod(counter, 0x1_0000_0000))); // ensure positive value
  const digest = createHmac("sha1", key).update(buffer).digest();
  const offset = digest[digest.length - 1] & 0xf;
  const binary = (digest.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits;
  return binary.toString().padStart(digits, "0");
};

export const verifyTotpCode = (
  secret: string | null | undefined,
  token: string,
  options: { window?: number; step?: number; digits?: number; timestamp?: number } = {},
): boolean => {
  if (!secret) return false;
  const expectedDigits = options.digits ?? 6;
  const normalizedToken = token.replace(/\s+/g, "");
  if (!/^[0-9]+$/.test(normalizedToken) || normalizedToken.length < expectedDigits) {
    return false;
  }
  const window = options.window ?? 1;
  const stepSeconds = options.step ?? 30;
  const timestamp = options.timestamp ?? Date.now();
  try {
    for (let offset = -window; offset <= window; offset += 1) {
      const comparisonTimestamp = timestamp + offset * stepSeconds * 1000;
      const generated = generateTotpCode(secret, {
        timestamp: comparisonTimestamp,
        step: stepSeconds,
        digits: expectedDigits,
      });
      const generatedBuffer = Buffer.from(generated);
      const tokenBuffer = Buffer.from(normalizedToken);
      if (
        generatedBuffer.length === tokenBuffer.length &&
        timingSafeEqual(generatedBuffer, tokenBuffer)
      ) {
        return true;
      }
    }
  } catch {
    return false;
  }
  return false;
};

export const generateNumericOtp = (digits = 6): string => {
  const max = 10 ** digits;
  return randomInt(0, max).toString().padStart(digits, "0");
};

export type MfaChallengeMethod = MfaMethod;
