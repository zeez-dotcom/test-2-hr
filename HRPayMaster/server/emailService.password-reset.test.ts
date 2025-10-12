import { beforeEach, describe, expect, it, vi } from "vitest";

let mockEmails: typeof import("./emailService")["mockEmails"];
let sendPasswordResetEmail: typeof import("./emailService")
  ["sendPasswordResetEmail"];

async function loadEmailModule() {
  vi.resetModules();
  process.env.EMAIL_FROM = "no-reply@example.com";
  ({ mockEmails, sendPasswordResetEmail } = await import("./emailService"));
  mockEmails.length = 0;
}

describe("sendPasswordResetEmail", () => {
  beforeEach(async () => {
    await loadEmailModule();
  });

  it("renders the template and queues an email", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const expiresAt = new Date("2024-01-01T00:00:00.000Z");

    await sendPasswordResetEmail({
      to: "user@example.com",
      resetUrl: "https://example.com/reset-password?token=abc",
      expiresAt,
      username: "Casey",
    });

    expect(mockEmails).toHaveLength(1);
    const email = mockEmails[0];
    expect(email.to).toBe("user@example.com");
    expect(email.from).toBe("no-reply@example.com");
    expect(email.subject).toContain("password reset");
    expect(email.html).toContain("HR PayMaster");
    expect(email.html).toContain("https://example.com/reset-password?token=abc");
    expect(email.html).toContain("Mon, 01 Jan 2024");
    expect(email.text).toContain("password reset");
    warnSpy.mockRestore();
  });
});
