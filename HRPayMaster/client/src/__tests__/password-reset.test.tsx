import { describe, it, beforeEach, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PasswordResetRequest from "../pages/password-reset-request";
import PasswordReset from "../pages/password-reset";
import { apiPost } from "@/lib/http";
import { useLocation } from "wouter";

vi.mock("@/lib/http", () => ({
  apiPost: vi.fn(),
}));

const navigateMock = vi.fn();

vi.mock("wouter", () => ({
  useLocation: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, string>) =>
      options?.email ? `${key} ${options.email}` : key,
  }),
}));

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (typeof globalThis.ResizeObserver === "undefined") {
  (globalThis as any).ResizeObserver = ResizeObserverStub;
}

describe("password reset pages", () => {
  beforeEach(() => {
    vi.mocked(apiPost).mockReset();
    navigateMock.mockReset();
  });

  it("submits forgot password form", async () => {
    vi.mocked(useLocation).mockReturnValue(["/forgot-password", navigateMock]);
    vi.mocked(apiPost).mockResolvedValue({ ok: true } as any);

    render(<PasswordResetRequest />);

    await userEvent.type(screen.getByLabelText("passwordReset.emailLabel"), "user@example.com");
    await userEvent.click(screen.getByRole("button", { name: "passwordReset.requestSubmit" }));

    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1));
    expect(apiPost).toHaveBeenCalledWith("/forgot-password", { email: "user@example.com" });
    expect(screen.getByText("passwordReset.requestSuccessTitle")).toBeTruthy();
    expect(screen.getByText("passwordReset.requestSuccessDescription user@example.com")).toBeTruthy();
  });

  it("validates and submits reset form", async () => {
    vi.mocked(useLocation).mockReturnValue(["/reset-password?token=abc123", navigateMock]);
    vi.mocked(apiPost).mockResolvedValue({ ok: true } as any);

    render(<PasswordReset />);

    const passwordInput = screen.getByLabelText("passwordReset.newPasswordLabel");
    const confirmInput = screen.getByLabelText("passwordReset.confirmPasswordLabel");

    await userEvent.clear(confirmInput);
    await userEvent.type(passwordInput, "Password1!");
    await userEvent.type(confirmInput, "Mismatch1!");
    await userEvent.click(screen.getByRole("button", { name: "passwordReset.resetSubmit" }));

    expect(screen.getByTestId("reset-error").textContent).toContain("passwordReset.passwordMismatch");

    vi.mocked(apiPost).mockClear();
    await userEvent.clear(confirmInput);
    await userEvent.type(confirmInput, "Password1!");
    await userEvent.click(screen.getByRole("button", { name: "passwordReset.resetSubmit" }));

    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1));
    expect(apiPost).toHaveBeenCalledWith("/reset-password", {
      token: "abc123",
      password: "Password1!",
    });
    expect(screen.getByText("passwordReset.resetSuccessTitle")).toBeTruthy();
  });
});
