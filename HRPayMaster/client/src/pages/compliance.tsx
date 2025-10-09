import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useSearch } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Documents from "@/pages/documents";
import Notifications from "@/pages/notifications";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiPut } from "@/lib/http";
import { useToast } from "@/hooks/use-toast";
import { sanitizeImageSrc } from "@/lib/sanitizeImageSrc";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import type { FleetExpiryCheck } from "@shared/schema";

export default function Compliance() {
  const { t } = useTranslation();
  const allowed = ["expiry", "fleet", "notifications", "approvals"] as const;
  const defaultTab = "expiry" as const;
  const [location, navigate] = useLocation();
  const search = useSearch();
  const qs = useMemo(() => new URLSearchParams(search), [search]);
  const initial = qs.get("tab")?.toLowerCase();
  const startTab = allowed.includes(initial as any) ? (initial as typeof allowed[number]) : defaultTab;
  const [tab, setTab] = useState<typeof allowed[number]>(startTab);

  useEffect(() => {
    const q = new URLSearchParams(search);
    const t = q.get("tab")?.toLowerCase();
    setTab(allowed.includes(t as any) ? (t as any) : defaultTab);
  }, [search]);

  const onTabChange = (value: string) => {
    const next = allowed.includes(value as any) ? value : defaultTab;
    setTab(next as any);
    navigate(`${location}?tab=${next}`);
  };
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold tracking-tight">{t('nav.compliance','Compliance')}</h1>
      <Tabs value={tab} onValueChange={onTabChange} className="space-y-4">
        <TabsList>
          <TabsTrigger value="expiry">{t('compliance.expiry','Expiry')}</TabsTrigger>
          <TabsTrigger value="fleet">{t('compliance.fleet','Fleet')}</TabsTrigger>
          <TabsTrigger value="notifications">{t('compliance.notifications','Notifications')}</TabsTrigger>
          <TabsTrigger value="approvals">{t('compliance.approvals','Approvals')}</TabsTrigger>
        </TabsList>
        <TabsContent value="expiry">
          <Documents />
        </TabsContent>
        <TabsContent value="fleet">
          <FleetExpiry />
        </TabsContent>
        <TabsContent value="notifications">
          <Notifications />
        </TabsContent>
        <TabsContent value="approvals">
          <Approvals />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function FleetExpiry() {
  const { t } = useTranslation();
  const { data: fleetChecks = [], isLoading, error } = useQuery<FleetExpiryCheck[]>({
    queryKey: ["/api/fleet/expiry-check"],
  });

  if (error) {
    return <div className="text-sm text-destructive">{t('compliance.fleetError','Failed to load fleet expiries.')}</div>;
  }

  const withExpiry = fleetChecks.filter((check) => Boolean(check.registrationExpiry));
  const expired = withExpiry.filter((check) => (check.daysUntilRegistrationExpiry ?? 0) < 0);
  const expiringSoon = withExpiry.filter((check) => {
    const days = check.daysUntilRegistrationExpiry ?? Infinity;
    return days >= 0 && days <= 30;
  });
  const missingDates = fleetChecks.filter((check) => !check.registrationExpiry);

  const getStatusBadge = (days: number | null) => {
    if (days === null) {
      return (
        <Badge className="bg-gray-100 text-gray-800 border-gray-200">
          {t('compliance.fleetMissing','Missing date')}
        </Badge>
      );
    }
    if (days < 0) {
      return (
        <Badge className="bg-red-100 text-red-800 border-red-200">
          {t('compliance.fleetExpired','Expired {{days}} days ago', { days: Math.abs(days) })}
        </Badge>
      );
    }
    if (days <= 7) {
      return (
        <Badge className="bg-red-100 text-red-800 border-red-200">
          {t('compliance.fleetDueWeek','Due in {{days}} days', { days })}
        </Badge>
      );
    }
    if (days <= 30) {
      return (
        <Badge className="bg-orange-100 text-orange-800 border-orange-200">
          {t('compliance.fleetDueSoon','Due in {{days}} days', { days })}
        </Badge>
      );
    }
    return (
      <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">
        {t('compliance.fleetCurrent','Current')}
      </Badge>
    );
  };

  const formatExpiryDate = (value: string | null) => {
    if (!value) return t('compliance.fleetNoDate','—');
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return format(parsed, 'PPP');
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg text-red-800 dark:text-red-200">
              {t('compliance.fleetExpiredTitle','Expired Registrations')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-800 dark:text-red-200">{expired.length}</div>
          </CardContent>
        </Card>

        <Card className="border-orange-200 bg-orange-50 dark:border-orange-900 dark:bg-orange-950">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg text-orange-800 dark:text-orange-200">
              {t('compliance.fleetSoonTitle','Due in 30 Days')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-800 dark:text-orange-200">{expiringSoon.length}</div>
          </CardContent>
        </Card>

        <Card className="border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg text-gray-800 dark:text-gray-200">
              {t('compliance.fleetMissingTitle','Missing Expiry Date')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-gray-800 dark:text-gray-200">{missingDates.length}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('compliance.fleetTableTitle','Vehicle Registration Status')}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, idx) => (
                <div key={idx} className="animate-pulse h-12 bg-muted rounded" />
              ))}
            </div>
          ) : fleetChecks.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              {t('compliance.fleetEmpty','No fleet vehicles found.')}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('compliance.fleetVehicle','Vehicle')}</TableHead>
                    <TableHead>{t('compliance.fleetExpiryDate','Registration Expiry')}</TableHead>
                    <TableHead>{t('compliance.fleetStatus','Status')}</TableHead>
                    <TableHead>{t('compliance.fleetAssigned','Assigned To')}</TableHead>
                    <TableHead>{t('compliance.fleetOwner','Registration Owner')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fleetChecks.map((check) => {
                    const vehicleLabel = `${check.year ? `${check.year} ` : ''}${check.make} ${check.model}`.trim();
                    return (
                      <TableRow key={check.carId}>
                        <TableCell>
                          <div className="font-medium">{vehicleLabel}</div>
                          <div className="text-xs text-muted-foreground">{t('compliance.fleetPlate','Plate')}: {check.plateNumber}</div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{formatExpiryDate(check.registrationExpiry)}</div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            {getStatusBadge(check.daysUntilRegistrationExpiry ?? null)}
                          </div>
                        </TableCell>
                        <TableCell>
                          {check.assignedEmployeeName || (
                            <span className="text-xs text-muted-foreground">{t('compliance.fleetUnassigned','Unassigned')}</span>
                          )}
                        </TableCell>
                        <TableCell>{check.registrationOwner || '—'}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Approvals() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { data: notifications = [], refetch } = useQuery<any[]>({
    queryKey: ["/api/notifications"],
  });
  const approvals = (notifications || []).filter(n => n.type === 'document_approval' && n.status !== 'dismissed');
  const { data: events = [] } = useQuery<any[]>({ queryKey: ["/api/employee-events"] });
  const [reasons, setReasons] = useState<Record<string,string>>({});
  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiPut(`/api/notifications/${id}/approve`, { reason: reasons[id] });
      if (!res.ok) throw new Error(res.error || 'Failed to approve');
    },
    onSuccess: () => { refetch(); toast({ title: t('actions.save','Approved') }); },
  });
  const rejectMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiPut(`/api/notifications/${id}/reject`, { reason: reasons[id] });
      if (!res.ok) throw new Error(res.error || 'Failed to reject');
    },
    onSuccess: () => { refetch(); toast({ title: t('compliance.rejected','Rejected') }); },
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('compliance.documentApprovals','Document Approvals')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {approvals.length === 0 ? (
            <div className="text-sm text-muted-foreground">{t('compliance.noApprovals','No approval requests.')}</div>
          ) : approvals.map((n) => (
            <div key={n.id} className="border rounded p-3 text-sm flex items-center justify-between">
              <div className="flex-1 pr-4">
                <div className="font-medium">{n.title}</div>
                <div className="text-muted-foreground">{n.message}</div>
                <div className="text-xs text-gray-500 mt-1">Doc#: {(n as any).documentControllerNumber || '—'} • {t('compliance.created','Created')}: {new Date(n.createdAt || '').toLocaleString()}</div>
                <div className="mt-2">
                  <input className="border rounded px-2 py-1 text-sm w-64" placeholder={t('compliance.reasonOptional','Reason (optional)')} value={reasons[n.id] || ''} onChange={e => setReasons(r => ({ ...r, [n.id]: e.target.value }))} />
                </div>
                {/* Document preview for specific document when linked, else latest */}
                {(() => {
                  let ev = null as any;
                  if ((n as any).documentEventId) {
                    ev = (events as any[]).find(e => e.id === (n as any).documentEventId);
                  }
                  if (!ev) {
                    ev = (events as any[]).filter(e => e.employeeId === n.employeeId && e.eventType === 'document_update' && (e as any).documentUrl).sort((a,b)=> +new Date((b as any).eventDate) - +new Date((a as any).eventDate))[0];
                  }
                  const url = (n as any).documentUrl || ev?.documentUrl;
                  if (!url) return null;
                  const isPDF = url.startsWith('data:application/pdf') || url.toLowerCase().endsWith('.pdf');
                  return (
                    <div className="mt-3">
                      <div className="text-xs text-muted-foreground">{t('compliance.documentPreview','Document Preview')}</div>
                      {isPDF ? (
                        <object data={url} type="application/pdf" className="w-full h-64 border" />
                      ) : (
                        <img src={sanitizeImageSrc(url)} className="max-h-64 border" />
                      )}
                    </div>
                  );
                })()}
              </div>
              <div className="flex gap-2">
                <a href={`/employee-file?id=${encodeURIComponent(n.employeeId)}`} target="_blank" className="text-blue-600 underline text-sm mr-2">{t('compliance.viewFile','View File')}</a>
                <Button size="sm" variant="outline" onClick={() => approveMutation.mutate(n.id)} disabled={approveMutation.isPending}>{t('compliance.approve','Approve')}</Button>
                <Button size="sm" variant="outline" onClick={() => rejectMutation.mutate(n.id)} disabled={rejectMutation.isPending || !(reasons[n.id] && reasons[n.id].trim())}>{t('compliance.reject','Reject')}</Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
