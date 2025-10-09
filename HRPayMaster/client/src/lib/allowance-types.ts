import { useMutation, useQuery } from "@tanstack/react-query";
import type { AllowanceType, InsertAllowanceType } from "@shared/schema";
import { apiGet, apiPost } from "./http";
import { queryClient } from "./queryClient";

export const allowanceTypesQueryKey = ["/api/allowance-types"] as const;

async function fetchAllowanceTypes(): Promise<AllowanceType[]> {
  const res = await apiGet("/api/allowance-types");
  if (!res.ok) {
    throw new Error(res.error || "Failed to fetch allowance types");
  }
  return (res.data as AllowanceType[]) ?? [];
}

export function useAllowanceTypes() {
  return useQuery({
    queryKey: allowanceTypesQueryKey,
    queryFn: fetchAllowanceTypes,
  });
}

export function useCreateAllowanceType(options?: {
  onSuccess?: (type: AllowanceType) => void;
  onError?: (error: Error) => void;
}) {
  return useMutation<AllowanceType, Error, InsertAllowanceType>({
    mutationFn: async payload => {
      const res = await apiPost("/api/allowance-types", payload);
      if (!res.ok) {
        throw new Error(res.error || "Failed to create allowance type");
      }
      return res.data as AllowanceType;
    },
    onSuccess: async (data, variables, context) => {
      await queryClient.invalidateQueries({ queryKey: allowanceTypesQueryKey });
      options?.onSuccess?.(data);
    },
    onError: (error, variables, context) => {
      options?.onError?.(error);
    },
  });
}
