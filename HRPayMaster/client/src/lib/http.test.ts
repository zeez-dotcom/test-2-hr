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
});

