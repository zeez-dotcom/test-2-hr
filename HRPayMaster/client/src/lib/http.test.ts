import { afterEach, describe, expect, it, vi } from "vitest";

import { apiGet } from "./http";

describe("request", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("preserves blob bodies for non-JSON responses", async () => {
    const body = "example-binary";
    const blob = new Blob([body], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    const headers = new Headers({
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const response = {
      ok: true,
      status: 200,
      headers,
      blob: vi.fn().mockResolvedValue(blob),
    } satisfies Partial<Response> & { ok: true; status: number };

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(response as Response);

    const result = await apiGet("/api/employees/import/template");

    expect(fetchSpy).toHaveBeenCalledWith("/api/employees/import/template", expect.any(Object));
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected request to succeed");
    }

    expect(response.blob).toHaveBeenCalledTimes(1);
    expect(result.data).toBe(blob);
  });

  it("treats HTML content responses as errors", async () => {
    const headers = new Headers({ "content-type": "text/html" });
    const response = {
      ok: true,
      status: 200,
      headers,
      text: vi.fn().mockResolvedValue("<html><body>Error</body></html>"),
    } satisfies Partial<Response> & { ok: true; status: number };

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(response as Response);

    const result = await apiGet("/api/reports/export");

    expect(fetchSpy).toHaveBeenCalledWith("/api/reports/export", expect.any(Object));
    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected HTML response to surface as an error");
    }

    expect(result.error).toContain("<html>");
  });

  it("prefers configured base URL over window origin in development", async () => {
    const originalWindow = globalThis.window;

    vi.stubEnv("MODE", "development");
    vi.stubEnv("VITE_API_BASE_URL", "http://localhost:5000");

    globalThis.window = {
      location: {
        origin: "http://localhost:5173",
      },
    } as any;

    const response = {
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: vi.fn().mockResolvedValue({ success: true }),
    } satisfies Partial<Response> & { ok: true; status: number };

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(response as Response);

    try {
      const result = await apiGet("/api/test");

      expect(fetchSpy).toHaveBeenCalledWith(
        "http://localhost:5000/api/test",
        expect.objectContaining({ credentials: "include" }),
      );

      expect(result.ok).toBe(true);
    } finally {
      vi.unstubAllEnvs();
      globalThis.window = originalWindow;
    }
  });
});

