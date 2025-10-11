import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { toastApiError } from "@/lib/toastError";
import { getQueryFn } from "@/lib/queryClient";
import { apiPost } from "@/lib/http";
import type {
  AccessRequest,
  PermissionSet,
  SecurityAuditEvent,
  SessionUser,
} from "@shared/schema";

interface BasicUserInfo {
  id: string;
  username: string;
  email: string;
  role: string;
}

interface AccessRequestDetail extends AccessRequest {
  permissionSet?: PermissionSet | null;
  requester?: BasicUserInfo | null;
  reviewer?: BasicUserInfo | null;
}

interface SecurityAuditEventDetail extends SecurityAuditEvent {
  actor?: BasicUserInfo | null;
}

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

const ACCESS_STATUS_LABELS: Record<AccessRequest["status"], string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

const ACCESS_STATUS_VARIANTS: Record<AccessRequest["status"], BadgeVariant> = {
  pending: "secondary",
  approved: "default",
  rejected: "destructive",
};

type RequestFormState = {
  permissionSetKey: string;
  reason: string;
  startAt: string;
  expiresAt: string;
};

type ApprovalFormState = {
  startAt: string;
  expiresAt: string;
  notes: string;
};

const INITIAL_REQUEST_FORM: RequestFormState = {
  permissionSetKey: "",
  reason: "",
  startAt: "",
  expiresAt: "",
};

const INITIAL_APPROVAL_FORM: ApprovalFormState = {
  startAt: "",
  expiresAt: "",
  notes: "",
};

const formatDateTime = (value?: string | Date | null) => {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  try {
    return format(date, "PPpp");
  } catch {
    return date.toLocaleString();
  }
};

const formatAccessWindow = (
  startAt?: string | Date | null,
  expiresAt?: string | Date | null,
) => {
  const start = formatDateTime(startAt);
  const end = formatDateTime(expiresAt);
  if (start === "-" && end === "-") {
    return "-";
  }
  if (end === "-") {
    return `${start} →`; // open-ended
  }
  if (start === "-") {
    return `Until ${end}`;
  }
  return `${start} → ${end}`;
};

export default function Security() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const session = queryClient.getQueryData<SessionUser | null>(["/api/me"]);

  const canRequestAccess = session?.permissions.includes("security:access:request") ?? false;
  const canReviewAccess = session?.permissions.includes("security:access:review") ?? false;
  const canViewAudit = session?.permissions.includes("security:audit:view") ?? false;

  const [requestDialogOpen, setRequestDialogOpen] = useState(false);
  const [requestForm, setRequestForm] = useState<RequestFormState>(INITIAL_REQUEST_FORM);
  const [approvalDialog, setApprovalDialog] = useState<AccessRequestDetail | null>(null);
  const [approvalForm, setApprovalForm] = useState<ApprovalFormState>(INITIAL_APPROVAL_FORM);
  const [rejectionDialog, setRejectionDialog] = useState<AccessRequestDetail | null>(null);
  const [rejectionNotes, setRejectionNotes] = useState("");

  const { data: permissionSets } = useQuery<PermissionSet[]>({
    queryKey: ["/api/security/permission-sets"],
    queryFn: getQueryFn<PermissionSet[]>(),
    enabled: canRequestAccess,
    staleTime: 5 * 60 * 1000,
  });

  const { data: accessRequests, isLoading: isLoadingRequests } = useQuery<AccessRequestDetail[]>({
    queryKey: ["/api/security/access-requests"],
    queryFn: getQueryFn<AccessRequestDetail[]>(),
    enabled: canRequestAccess || canReviewAccess,
  });

  const { data: auditEvents, isLoading: isLoadingAudit } = useQuery<SecurityAuditEventDetail[]>({
    queryKey: ["/api/security/audit-events"],
    queryFn: getQueryFn<SecurityAuditEventDetail[]>(),
    enabled: canViewAudit,
  });

  useEffect(() => {
    if (!canRequestAccess) {
      setRequestDialogOpen(false);
    }
  }, [canRequestAccess]);

  useEffect(() => {
    if (!requestDialogOpen) {
      setRequestForm(prev => ({
        ...INITIAL_REQUEST_FORM,
        permissionSetKey: prev.permissionSetKey,
      }));
    }
  }, [requestDialogOpen]);

  useEffect(() => {
    if (!approvalDialog) {
      setApprovalForm(INITIAL_APPROVAL_FORM);
    }
  }, [approvalDialog]);

  useEffect(() => {
    if (!rejectionDialog) {
      setRejectionNotes("");
    }
  }, [rejectionDialog]);

  useEffect(() => {
    if (canRequestAccess && permissionSets && permissionSets.length > 0 && !requestForm.permissionSetKey) {
      setRequestForm(form => ({ ...form, permissionSetKey: permissionSets[0]!.key }));
    }
  }, [canRequestAccess, permissionSets, requestForm.permissionSetKey]);

  const sortedRequests = useMemo(() => {
    if (!accessRequests) return [];
    return [...accessRequests].sort((a, b) => {
      const aTime = new Date(a.requestedAt ?? 0).getTime();
      const bTime = new Date(b.requestedAt ?? 0).getTime();
      return bTime - aTime;
    });
  }, [accessRequests]);

  const createRequest = useMutation({
    mutationFn: async () => {
      const payload = {
        permissionSetKey: requestForm.permissionSetKey,
        reason: requestForm.reason.trim() || undefined,
        startAt: requestForm.startAt || undefined,
        expiresAt: requestForm.expiresAt || undefined,
      };
      const res = await apiPost("/api/security/access-requests", payload);
      if (!res.ok) {
        throw res;
      }
      return res.data as AccessRequestDetail;
    },
    onSuccess: () => {
      toast({
        title: t("securityPage.requestSubmitted", "Access request submitted"),
      });
      setRequestDialogOpen(false);
      setRequestForm(INITIAL_REQUEST_FORM);
      queryClient.invalidateQueries({ queryKey: ["/api/security/access-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/security/audit-events"] });
    },
    onError: (error) => {
      toastApiError(error, t("securityPage.requestFailed", "Failed to submit access request"));
    },
  });

  const approveRequest = useMutation({
    mutationFn: async (requestId: string) => {
      const payload = {
        startAt: approvalForm.startAt || undefined,
        expiresAt: approvalForm.expiresAt || undefined,
        notes: approvalForm.notes.trim() || undefined,
      };
      const res = await apiPost(`/api/security/access-requests/${requestId}/approve`, payload);
      if (!res.ok) {
        throw res;
      }
      return res.data as AccessRequestDetail;
    },
    onSuccess: () => {
      toast({
        title: t("securityPage.requestApproved", "Access request approved"),
      });
      setApprovalDialog(null);
      queryClient.invalidateQueries({ queryKey: ["/api/security/access-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/security/audit-events"] });
    },
    onError: (error) => {
      toastApiError(error, t("securityPage.approvalFailed", "Failed to approve request"));
    },
  });

  const rejectRequest = useMutation({
    mutationFn: async (requestId: string) => {
      const payload = {
        notes: rejectionNotes.trim() || undefined,
      };
      const res = await apiPost(`/api/security/access-requests/${requestId}/reject`, payload);
      if (!res.ok) {
        throw res;
      }
      return res.data as AccessRequestDetail;
    },
    onSuccess: () => {
      toast({
        title: t("securityPage.requestRejected", "Access request rejected"),
      });
      setRejectionDialog(null);
      queryClient.invalidateQueries({ queryKey: ["/api/security/access-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/security/audit-events"] });
    },
    onError: (error) => {
      toastApiError(error, t("securityPage.rejectionFailed", "Failed to reject request"));
    },
  });

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
          {t("securityPage.title", "Security & Access Center")}
        </h1>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          {t(
            "securityPage.subtitle",
            "Review audit activity, manage temporary access, and monitor privileged operations.",
          )}
        </p>
      </div>

      {(canRequestAccess || canReviewAccess) && (
        <Card>
          <CardHeader className="flex flex-col gap-2 space-y-0 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>{t("securityPage.accessRequests", "Access requests")}</CardTitle>
              <CardDescription>
                {t(
                  "securityPage.accessRequestsDescription",
                  "Track and approve temporary permission grants.",
                )}
              </CardDescription>
            </div>
            {canRequestAccess && (
              <Button onClick={() => setRequestDialogOpen(true)}>
                {t("securityPage.newRequest", "Request temporary access")}
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {isLoadingRequests ? (
              <p className="text-sm text-gray-600 dark:text-gray-300">
                {t("securityPage.loadingRequests", "Loading requests...")}
              </p>
            ) : sortedRequests.length === 0 ? (
              <p className="text-sm text-gray-600 dark:text-gray-300">
                {t("securityPage.noRequests", "No access requests yet.")}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-800">
                  <thead className="bg-gray-50 dark:bg-gray-900/40">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium text-gray-700 dark:text-gray-200">
                        {t("securityPage.permissionSet", "Permission set")}
                      </th>
                      <th className="px-4 py-2 text-left font-medium text-gray-700 dark:text-gray-200">
                        {t("securityPage.requester", "Requester")}
                      </th>
                      <th className="px-4 py-2 text-left font-medium text-gray-700 dark:text-gray-200">
                        {t("securityPage.status", "Status")}
                      </th>
                      <th className="px-4 py-2 text-left font-medium text-gray-700 dark:text-gray-200">
                        {t("securityPage.window", "Access window")}
                      </th>
                      <th className="px-4 py-2 text-right font-medium text-gray-700 dark:text-gray-200">
                        {t("securityPage.actions", "Actions")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                    {sortedRequests.map(request => (
                      <tr key={request.id}>
                        <td className="px-4 py-3 align-top">
                          <div className="font-medium text-gray-900 dark:text-gray-100">
                            {request.permissionSet?.name ?? request.permissionSetId}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {request.reason || t("securityPage.noReason", "No justification provided")}
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="font-medium text-gray-900 dark:text-gray-100">
                            {request.requester?.username ?? request.requesterId}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {t("securityPage.requestedAt", "Requested")}: {formatDateTime(request.requestedAt)}
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="flex flex-col gap-1">
                            <Badge variant={ACCESS_STATUS_VARIANTS[request.status]}>
                              {ACCESS_STATUS_LABELS[request.status]}
                            </Badge>
                            {request.reviewer && (
                              <span className="text-xs text-gray-500 dark:text-gray-400">
                                {t("securityPage.reviewedBy", "Reviewer")}: {request.reviewer.username}
                              </span>
                            )}
                            {request.decisionNotes && (
                              <span className="text-xs text-gray-500 dark:text-gray-400">
                                {request.decisionNotes}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="text-sm text-gray-900 dark:text-gray-100">
                            {formatAccessWindow(request.startAt, request.expiresAt)}
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top text-right">
                          {request.status === "pending" && canReviewAccess ? (
                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setApprovalDialog(request)}
                              >
                                {t("securityPage.approve", "Approve")}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                                onClick={() => setRejectionDialog(request)}
                              >
                                {t("securityPage.reject", "Reject")}
                              </Button>
                            </div>
                          ) : request.status === "pending" && request.requesterId === session?.id ? (
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {t("securityPage.awaitingReview", "Awaiting reviewer action")}
                            </span>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {canViewAudit && (
        <Card>
          <CardHeader>
            <CardTitle>{t("securityPage.auditLog", "Security audit log")}</CardTitle>
            <CardDescription>
              {t(
                "securityPage.auditDescription",
                "Recent high-risk operations and permission changes.",
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoadingAudit ? (
              <p className="text-sm text-gray-600 dark:text-gray-300">
                {t("securityPage.loadingAudit", "Loading audit events...")}
              </p>
            ) : !auditEvents || auditEvents.length === 0 ? (
              <p className="text-sm text-gray-600 dark:text-gray-300">
                {t("securityPage.noAudit", "No audit events recorded yet.")}
              </p>
            ) : (
              auditEvents.map(event => (
                <div
                  key={event.id}
                  className="rounded-lg border border-gray-200 p-4 dark:border-gray-800"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="uppercase">
                        {event.eventType}
                      </Badge>
                      <span className="font-medium text-gray-900 dark:text-gray-100">
                        {event.summary}
                      </span>
                    </div>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {formatDateTime(event.createdAt)}
                    </span>
                  </div>
                  <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    {event.actor
                      ? t("securityPage.actorInfo", "Actor: {{name}} ({{email}})", {
                          name: event.actor.username,
                          email: event.actor.email,
                        })
                      : t("securityPage.actorUnknown", "Actor unknown")}
                  </div>
                  {event.metadata && (
                    <pre className="mt-3 max-h-40 overflow-auto rounded bg-gray-50 p-3 text-xs text-gray-600 dark:bg-gray-900/60 dark:text-gray-300">
                      {JSON.stringify(event.metadata, null, 2)}
                    </pre>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}

      {canRequestAccess && permissionSets && (
        <Dialog open={requestDialogOpen} onOpenChange={setRequestDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{t("securityPage.requestDialogTitle", "Request temporary access")}</DialogTitle>
              <DialogDescription>
                {t(
                  "securityPage.requestDialogDescription",
                  "Choose a permission bundle and optional access window.",
                )}
              </DialogDescription>
            </DialogHeader>
            <form
              className="space-y-4"
              onSubmit={event => {
                event.preventDefault();
                if (!requestForm.permissionSetKey) {
                  toast({
                    title: t("securityPage.permissionSetRequired", "Select a permission set"),
                    variant: "destructive",
                  });
                  return;
                }
                createRequest.mutate();
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="permission-set">
                  {t("securityPage.permissionSet", "Permission set")}
                </Label>
                <Select
                  value={requestForm.permissionSetKey}
                  onValueChange={value =>
                    setRequestForm(form => ({ ...form, permissionSetKey: value }))
                  }
                >
                  <SelectTrigger id="permission-set">
                    <SelectValue
                      placeholder={t("securityPage.selectPermissionSet", "Select a permission set")}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {permissionSets.map(set => (
                      <SelectItem key={set.id} value={set.key}>
                        <div className="flex flex-col">
                          <span>{set.name}</span>
                          {set.description && (
                            <span className="text-xs text-muted-foreground">
                              {set.description}
                            </span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="request-reason">
                  {t("securityPage.reason", "Business justification")}
                </Label>
                <Textarea
                  id="request-reason"
                  value={requestForm.reason}
                  onChange={event =>
                    setRequestForm(form => ({ ...form, reason: event.target.value }))
                  }
                  placeholder={t(
                    "securityPage.reasonPlaceholder",
                    "Explain why elevated access is required.",
                  )}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="request-start">
                    {t("securityPage.startAt", "Start at")}
                  </Label>
                  <Input
                    id="request-start"
                    type="datetime-local"
                    value={requestForm.startAt}
                    onChange={event =>
                      setRequestForm(form => ({ ...form, startAt: event.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="request-end">
                    {t("securityPage.expiresAt", "Expires at")}
                  </Label>
                  <Input
                    id="request-end"
                    type="datetime-local"
                    value={requestForm.expiresAt}
                    onChange={event =>
                      setRequestForm(form => ({ ...form, expiresAt: event.target.value }))
                    }
                  />
                </div>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setRequestDialogOpen(false)}
                >
                  {t("actions.cancel", "Cancel")}
                </Button>
                <Button type="submit" disabled={createRequest.isPending}>
                  {createRequest.isPending
                    ? t("securityPage.submitting", "Submitting...")
                    : t("securityPage.submit", "Submit request")}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {approvalDialog && (
        <Dialog open={!!approvalDialog} onOpenChange={open => !open && setApprovalDialog(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{t("securityPage.approve", "Approve")}</DialogTitle>
              <DialogDescription>
                {t(
                  "securityPage.approveDescription",
                  "Confirm the access window and optional reviewer notes.",
                )}
              </DialogDescription>
            </DialogHeader>
            <form
              className="space-y-4"
              onSubmit={event => {
                event.preventDefault();
                approveRequest.mutate(approvalDialog.id);
              }}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="approve-start">
                    {t("securityPage.startAt", "Start at")}
                  </Label>
                  <Input
                    id="approve-start"
                    type="datetime-local"
                    value={approvalForm.startAt}
                    onChange={event =>
                      setApprovalForm(form => ({ ...form, startAt: event.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="approve-end">
                    {t("securityPage.expiresAt", "Expires at")}
                  </Label>
                  <Input
                    id="approve-end"
                    type="datetime-local"
                    value={approvalForm.expiresAt}
                    onChange={event =>
                      setApprovalForm(form => ({ ...form, expiresAt: event.target.value }))
                    }
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="approve-notes">
                  {t("securityPage.reviewerNotes", "Reviewer notes")}
                </Label>
                <Textarea
                  id="approve-notes"
                  value={approvalForm.notes}
                  onChange={event =>
                    setApprovalForm(form => ({ ...form, notes: event.target.value }))
                  }
                  placeholder={t("securityPage.optionalNotes", "Optional context for the requester")}
                />
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setApprovalDialog(null)}
                >
                  {t("actions.cancel", "Cancel")}
                </Button>
                <Button type="submit" disabled={approveRequest.isPending}>
                  {approveRequest.isPending
                    ? t("securityPage.approving", "Approving...")
                    : t("securityPage.confirmApprove", "Approve request")}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {rejectionDialog && (
        <Dialog open={!!rejectionDialog} onOpenChange={open => !open && setRejectionDialog(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{t("securityPage.reject", "Reject")}</DialogTitle>
              <DialogDescription>
                {t(
                  "securityPage.rejectDescription",
                  "Optionally provide a reason for rejecting this request.",
                )}
              </DialogDescription>
            </DialogHeader>
            <form
              className="space-y-4"
              onSubmit={event => {
                event.preventDefault();
                rejectRequest.mutate(rejectionDialog.id);
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="rejection-notes">
                  {t("securityPage.reviewerNotes", "Reviewer notes")}
                </Label>
                <Textarea
                  id="rejection-notes"
                  value={rejectionNotes}
                  onChange={event => setRejectionNotes(event.target.value)}
                  placeholder={t("securityPage.rejectionPlaceholder", "Share context with the requester")}
                />
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setRejectionDialog(null)}
                >
                  {t("actions.cancel", "Cancel")}
                </Button>
                <Button type="submit" disabled={rejectRequest.isPending} variant="destructive">
                  {rejectRequest.isPending
                    ? t("securityPage.rejecting", "Rejecting...")
                    : t("securityPage.confirmReject", "Reject request")}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
