import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { apiGet } from "./http";

export const getQueryFn = (
  options?: { on401?: "returnNull" },
): QueryFunction => {
  return async ({ queryKey }) => {
    const res = await apiGet(queryKey.join("/") as string);
    if (!res.ok) {
      if (res.status === 401 && options?.on401 === "returnNull") {
        return null;
      }
      throw new Error(res.error || `Request failed with status ${res.status}`);
    }
    return res.data;
  };
};

export const defaultQueryFn = getQueryFn();

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: defaultQueryFn,
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

