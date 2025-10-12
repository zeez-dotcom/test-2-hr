import { describe, it, beforeEach, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Login from "../pages/login";
import { apiPost } from "@/lib/http";
import { queryClient } from "@/lib/queryClient";
import { useLocation } from "wouter";

vi.mock("@/lib/http", () => ({
  apiPost: vi.fn(),
}));

vi.mock("@/lib/queryClient", () => ({
  queryClient: {
    invalidateQueries: vi.fn(),
  },
}));

const navigateMock = vi.fn();

vi.mock("wouter", () => ({
  useLocation: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, string>) =>
      options?.target ? `${key} ${options.target}` : key,
    i18n: { language: "en", changeLanguage: vi.fn() },
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

describe("Login MFA flow", () => {
  beforeEach(() => {
    vi.mocked(apiPost).mockReset();
    vi.mocked(queryClient.invalidateQueries).mockReset();
    navigateMock.mockReset();
    vi.mocked(useLocation).mockReturnValue(["/login", navigateMock]);
  });

  it("navigates directly when MFA is not required", async () => {
    vi.mocked(apiPost).mockResolvedValue({
      ok: true,
      data: { user: { id: "1" } },
    } as any);

    render(<Login />);

    await userEvent.type(screen.getByLabelText("login.username"), "admin");
    await userEvent.type(screen.getByLabelText("login.password"), "admin");
    await userEvent.click(screen.getByRole("button", { name: "login.submit" }));

    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1));
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["/api/me"] });
    expect(navigateMock).toHaveBeenCalledWith("/");
  });

  it("prompts for MFA and submits code", async () => {
    vi.mocked(apiPost)
      .mockResolvedValueOnce({
        ok: true,
        data: {
          mfaRequired: true,
          challenge: {
            id: "challenge-1",
            method: "email_otp",
            expiresAt: new Date("2025-01-01T00:00:00.000Z").toISOString(),
            deliveryHint: "a***@example.com",
          },
        },
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        data: { user: { id: "1" } },
      } as any);

    render(<Login />);

    await userEvent.type(screen.getByLabelText("login.username"), "admin");
    await userEvent.type(screen.getByLabelText("login.password"), "admin");
    await userEvent.click(screen.getByRole("button", { name: "login.submit" }));

    await screen.findByText("login.mfaTitle");
    const codeInput = screen.getByLabelText("login.mfaCodeLabel");
    await userEvent.type(codeInput, "123456");
    await userEvent.click(screen.getByRole("button", { name: "login.mfaVerify" }));

    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(2));
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["/api/me"] });
    expect(navigateMock).toHaveBeenCalledWith("/");
  });

  it("shows an error when MFA verification fails", async () => {
    vi.mocked(apiPost)
      .mockResolvedValueOnce({
        ok: true,
        data: {
          mfaRequired: true,
          challenge: {
            id: "challenge-2",
            method: "totp",
            expiresAt: new Date("2025-01-01T00:00:00.000Z").toISOString(),
          },
        },
      } as any)
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        error: "Bad code",
      } as any);

    render(<Login />);

    await userEvent.type(screen.getByLabelText("login.username"), "admin");
    await userEvent.type(screen.getByLabelText("login.password"), "admin");
    await userEvent.click(screen.getByRole("button", { name: "login.submit" }));

    await screen.findByText("login.mfaTitle");
    await userEvent.type(screen.getByLabelText("login.mfaCodeLabel"), "000000");
    await userEvent.click(screen.getByRole("button", { name: "login.mfaVerify" }));

    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId("mfa-error").textContent).toContain("Bad code");
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
