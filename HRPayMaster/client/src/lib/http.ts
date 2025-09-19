export type ApiResult<T = any> =
  | { ok: true; status: number; data: T; headers: Headers }
  | { ok: false; status: number; error: any; headers?: Headers };

async function request(
  method: string,
  url: string,
  data?: unknown,
  isUpload = false,
) {
  const headers: Record<string, string> = { Accept: "application/json" };
  const init: RequestInit = {
    method,
    credentials: "include",
    cache: "no-store",
    headers,
  };

  if (data instanceof FormData) {
    init.body = data as any;
  } else if (data !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(data);
  }

  try {
    // Prefer same-origin during development so switching ports (e.g. 5001, 5020)
    // does not require updating VITE_API_BASE_URL. Still honor absolute URLs
    // and allow explicit base URL in production.
    const env = (import.meta as any)?.env || {};
    const isTestEnv = env?.MODE === "test";
    const isProd = env?.MODE === "production";
    let base: string | undefined = env?.VITE_API_BASE_URL as string | undefined;

    if (typeof window !== "undefined" && !isProd) {
      const current = window.location.origin;
      // If base is unset, or points to localhost on a different port, prefer current origin in dev
      if (!base || (/^https?:\/\/localhost(?::\d+)?/i.test(base) && !base.startsWith(current))) {
        base = current;
      }
    }

    const shouldPrefix = !!base && !isTestEnv && !/^https?:\/\//i.test(url);
    const fullUrl = shouldPrefix ? new URL(url, base).toString() : url;
    const res = await fetch(fullUrl, init);
    // Some tests/mock responses may not include headers/content-type.
    const contentType = (res as any)?.headers?.get?.("content-type") || "";
    let body: any = undefined;
    if (contentType.includes("application/json")) {
      body = await (res as any).json().catch(() => undefined);
    } else if (typeof (res as any).json === "function") {
      // Fallback to json() when headers are missing or content-type is not set
      try {
        body = await (res as any).json();
      } catch {
        body = undefined;
      }
    } else if (typeof (res as any).blob === "function") {
      body = await (res as any).blob();
    }
    if ((res as any).ok) {
      return { ok: true as const, status: (res as any).status ?? 200, data: body, headers: (res as any).headers };
    } else {
      return { ok: false as const, status: (res as any).status ?? 500, error: body, headers: (res as any).headers };
    }
  } catch (error: any) {
    return { ok: false as const, status: 0, error: error?.message ?? String(error) };
  }
}

export function apiGet(url: string) {
  return request("GET", url);
}

export function apiPost(url: string, data?: unknown) {
  return request("POST", url, data);
}

export function apiPut(url: string, data?: unknown) {
  return request("PUT", url, data);
}

export function apiDelete(url: string) {
  return request("DELETE", url);
}

export function apiUpload(url: string, data: FormData) {
  return request("POST", url, data, true);
}
