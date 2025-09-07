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
    const res = await fetch(url, init);
    const contentType = res.headers.get("content-type") || "";
    let body: any = undefined;
    if (contentType.includes("application/json")) {
      body = await res.json().catch(() => undefined);
    } else {
      body = await res.blob();
    }
    if (res.ok) {
      return { ok: true as const, status: res.status, data: body, headers: res.headers };
    } else {
      return { ok: false as const, status: res.status, error: body, headers: res.headers };
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

