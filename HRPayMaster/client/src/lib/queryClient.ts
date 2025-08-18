import { QueryClient, QueryFunction, QueryCache } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const contentType = res.headers.get("content-type") ?? "";
    let message: string;

    if (!contentType.includes("application/json")) {
      await res.text();
      message = "Unexpected non-JSON response";
    } else {
      message = (await res.text()) || res.statusText;
    }

    const error = new Error(`${res.status}: ${message}`) as Error & {
      status?: number;
    };
    error.status = res.status;
    throw error;
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: {
      Accept: "application/json",
      ...(data ? { "Content-Type": "application/json" } : {}),
    },
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
    cache: "no-store",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    try {
      const res = await apiRequest("GET", queryKey.join("/") as string);
      return await res.json();
    } catch (err: any) {
      if (
        unauthorizedBehavior === "returnNull" &&
        (err.status === 401 || err.message?.startsWith("401"))
      ) {
        return null;
      }
      throw err;
    }
  };

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error: unknown) => {
      const message =
        error instanceof Error
          ? error.message
          : "An unexpected error occurred";
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
    },
  }),
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
