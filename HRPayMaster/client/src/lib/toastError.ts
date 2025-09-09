import i18next from "i18next"
import { toast } from "@/hooks/use-toast"
import type { ApiResult } from "./http"

export function toastApiError(
  result: ApiResult | unknown,
  fallback = i18next.t("errors.general")
) {
  let message: string | undefined;
  if (typeof result === "string") {
    message = result;
  } else if (result instanceof Error) {
    message = result.message;
  } else if (result && typeof result === "object" && "error" in result) {
    const err: any = (result as any).error;
    message = typeof err === "string" ? err : err?.message;
  }
  toast({
    title: i18next.t("errors.errorTitle"),
    description: message || fallback,
    variant: "destructive",
  })
}
