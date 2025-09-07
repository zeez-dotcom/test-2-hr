import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { apiGet } from "./http";

const defaultQueryFn: QueryFunction = async ({ queryKey }) => {
  const res = await apiGet(queryKey.join("/") as string);
  if (!res.ok) {
    throw new Error(res.error || `Request failed with status ${res.status}`);
  }
  return res.data;
};

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

