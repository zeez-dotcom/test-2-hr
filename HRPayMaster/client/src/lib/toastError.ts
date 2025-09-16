import i18n from "@/lib/i18n";
import { toast } from "@/hooks/use-toast";
import type { ApiResult } from "./http";

export function toastApiError(
  result: ApiResult | unknown,
  fallback?: string,
) {
  let fieldMessage: string | undefined;
  let serverMessage: string | undefined;

  if (result && typeof result === "object") {
    // Handle ApiResult style
    if ("error" in (result as any)) {
      const err: any = (result as any).error;
      serverMessage = typeof err === "string" ? err : err?.message;
      const maybeFields = (err as any)?.fields;
      if (Array.isArray(maybeFields) && maybeFields.length > 0) {
        fieldMessage = maybeFields[0]?.message;
      }
    }
    // Handle error wrappers like { response: { json: () => ({ error: { fields: [...] } }) } }
    const resp: any = (result as any)?.response;
    if (!fieldMessage && resp?.json) {
      try {
        const parsed = resp.json();
        if (parsed && typeof (parsed as any).then !== "function") {
          const err = (parsed as any)?.error;
          if (Array.isArray(err?.fields) && err.fields.length > 0) {
            fieldMessage = err.fields[0]?.message;
          } else if (typeof err?.message === "string") {
            serverMessage = err.message;
          }
        }
      } catch {
        // ignore json parsing errors
      }
    }
  } else if (typeof result === "string") {
    serverMessage = result;
  } else if (result instanceof Error) {
    serverMessage = result.message;
  }

  const errorTitle = (() => {
    try {
      const t = (i18n as any)?.t?.("errors.errorTitle");
      return (typeof t === "string" && t) || "Error";
    } catch {
      return "Error";
    }
  })();

  if (fieldMessage) {
    // Validation-style errors: show as title only
    toast({ title: fieldMessage, variant: "destructive" });
    return;
  }

  if (serverMessage && result && typeof result === "object" && "error" in (result as any)) {
    // Server-provided message: title 'Error', message as description
    toast({ title: errorTitle, description: serverMessage, variant: "destructive" });
    return;
  }

  if (typeof result === "string") {
    // Plain string errors are generic in our tests; prefer fallback as title when provided
    if (fallback) {
      toast({ title: fallback, variant: "destructive" });
      return;
    }
    toast({ title: errorTitle, description: serverMessage, variant: "destructive" });
    return;
  }

  if (serverMessage) {
    toast({ title: errorTitle, description: serverMessage, variant: "destructive" });
    return;
  }

  if (fallback) {
    // No server message, show fallback as title without description
    toast({ title: fallback, variant: "destructive" });
    return;
  }

  const general = (() => {
    try {
      const t = (i18n as any)?.t?.("errors.general");
      return (typeof t === "string" && t) || "An unexpected error occurred";
    } catch {
      return "An unexpected error occurred";
    }
  })();

  toast({ title: errorTitle, description: general, variant: "destructive" });
}
