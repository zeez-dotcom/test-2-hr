import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Bell, CheckCircle, Clock, AlertTriangle, FileText, CreditCard, BookOpen, CalendarCheck } from "lucide-react";
import { format } from "date-fns";
import { queryClient } from "@/lib/queryClient";
import { apiPut, apiDelete, apiPost } from "@/lib/http";
import { useToast } from "@/hooks/use-toast";
import type {
  NotificationWithEmployee,
  NotificationRoutingRuleWithSteps,
  NotificationChannel,
} from "@shared/schema";

type RuleStepDraft = {
  id?: string;
  ruleId?: string;
  level: number;
  escalateAfterMinutes: number;
  targetRole: string;
  channel: NotificationChannel | string;
  messageTemplate?: string | null;
  createdAt?: Date | null;
};

type RuleDraft = {
  id?: string;
  name: string;
  triggerType: string;
  description?: string | null;
  slaMinutes: number;
  deliveryChannels: NotificationChannel[];
  escalationStrategy: string;
  metadata?: Record<string, unknown>;
  steps: RuleStepDraft[];
};

const createEmptyRule = (): RuleDraft => ({
  name: "New Routing Rule",
  triggerType: "visa_expiry",
  description: "",
  slaMinutes: 60,
  deliveryChannels: ["email"],
  escalationStrategy: "sequential",
  metadata: {},
  steps: [
    {
      level: 1,
      escalateAfterMinutes: 60,
      targetRole: "manager",
      channel: "email",
      messageTemplate: "",
      createdAt: null,
    },
  ],
});

export default function NotificationsPage() {
  const { toast } = useToast();
  const { t } = useTranslation();
  const channelOptions: NotificationChannel[] = [
    "email",
    "sms",
    "chat",
    "push",
  ];
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);
  const [draftRule, setDraftRule] = useState<RuleDraft>(createEmptyRule());
  const [digestEmail, setDigestEmail] = useState("");

  const {
    data: notifications = [],
    isLoading,
    error: notificationsError,
  } = useQuery<NotificationWithEmployee[]>({
    queryKey: ["/api/notifications"],
  });

  const {
    data: unreadNotifications = [],
    error: unreadError,
  } = useQuery<NotificationWithEmployee[]>({
    queryKey: ["/api/notifications/unread"],
  });

  const {
    data: routingRules = [],
    isLoading: rulesLoading,
  } = useQuery<NotificationRoutingRuleWithSteps[]>({
    queryKey: ["/api/notifications/rules"],
  });

  const selectedRule = useMemo(
    () => routingRules.find(rule => rule.id === selectedRuleId) ?? null,
    [routingRules, selectedRuleId],
  );

  useEffect(() => {
    if (selectedRule) {
      setDraftRule({
        id: selectedRule.id,
        name: selectedRule.name,
        triggerType: selectedRule.triggerType,
        description: selectedRule.description,
        slaMinutes: selectedRule.slaMinutes,
        deliveryChannels: selectedRule.deliveryChannels ?? [],
        escalationStrategy: selectedRule.escalationStrategy,
        metadata: selectedRule.metadata ?? {},
        steps: selectedRule.steps.map(step => ({
          id: step.id,
          ruleId: step.ruleId,
          level: step.level,
          escalateAfterMinutes: step.escalateAfterMinutes,
          targetRole: step.targetRole,
          channel: step.channel,
          messageTemplate: step.messageTemplate,
          createdAt: step.createdAt,
        })),
      });
    }
  }, [selectedRule]);

  const markAsReadMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiPut(`/api/notifications/${id}/read`);
      if (!res.ok) throw new Error(res.error || "Failed to mark as read");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread"] });
      toast({ title: t('actions.save','Success'), description: t('notifications.read','Notification marked as read') });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to mark notification as read",
        variant: "destructive",
      });
    },
  });

  const deleteNotificationMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiDelete(`/api/notifications/${id}`);
      if (!res.ok) throw new Error(res.error || "Failed to delete notification");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread"] });
      toast({ title: t('notifications.deleted','Notification deleted') });
    },
    onError: () => {
      toast({
        title: "Error", 
        description: "Failed to delete notification",
        variant: "destructive",
      });
    },
  });

  const snoozeMutation = useMutation({
    mutationFn: async ({ id, days }: { id: string; days: number }) => {
      const until = new Date(Date.now() + days * 86400000).toISOString();
      const res = await apiPut(`/api/notifications/${id}/snooze`, { snoozedUntil: until });
      if (!res.ok) throw new Error(res.error || "Failed to snooze notification");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      toast({ title: t('notifications.snoozed','Snoozed'), description: t('notifications.snoozedDesc','Notification snoozed') });
    },
    onError: () => {
      toast({ title: t('errors.errorTitle','Error'), description: t('notifications.snoozeFailed','Failed to snooze notification'), variant: "destructive" });
    }
  });

  const formatChannelLabel = (channel: NotificationChannel) => {
    switch (channel) {
      case "sms":
        return "SMS";
      case "chat":
        return "Chat";
      case "push":
        return "Push";
      default:
        return "Email";
    }
  };

  const getEscalationStatusVariant = (status: string) => {
    switch (status) {
      case "resolved":
        return "secondary" as const;
      case "escalated":
        return "default" as const;
      case "closed":
        return "outline" as const;
      default:
        return "destructive" as const;
    }
  };

  const getSlaProgress = (notification: NotificationWithEmployee) => {
    if (!notification.slaDueAt) return 0;
    const createdAt = notification.createdAt ? new Date(notification.createdAt) : null;
    const dueAt = new Date(notification.slaDueAt);
    if (!createdAt || Number.isNaN(dueAt.getTime())) return 0;
    const total = dueAt.getTime() - createdAt.getTime();
    const elapsed = Date.now() - createdAt.getTime();
    if (total <= 0) return 100;
    return Math.min(100, Math.max(0, (elapsed / total) * 100));
  };

  const handleEscalateClick = (notification: NotificationWithEmployee) => {
    const reason = window.prompt("Escalation reason (optional)") ?? undefined;
    escalateMutation.mutate({ id: notification.id, reason });
  };

  const handleDigestSend = () => {
    if (!digestEmail) {
      toast({ title: "Recipient required", description: "Enter an email to send the digest", variant: "destructive" });
      return;
    }
    digestMutation.mutate(digestEmail);
  };

  const handleRuleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    upsertRuleMutation.mutate(draftRule);
  };

  const handleCreateRule = () => {
    setSelectedRuleId(null);
    setDraftRule(createEmptyRule());
  };

  const escalateMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) => {
      const res = await apiPost(`/api/notifications/${id}/escalate`, reason ? { reason } : {});
      if (!res.ok) throw new Error(res.error || "Failed to escalate notification");
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread"] });
      toast({ title: "Escalation queued", description: "Escalation has been triggered." });
    },
    onError: () => {
      toast({ title: "Escalation failed", description: "Unable to escalate notification", variant: "destructive" });
    },
  });

  const digestMutation = useMutation({
    mutationFn: async (email: string) => {
      const res = await apiPost(`/api/notifications/digest`, { recipientEmail: email });
      if (!res.ok) throw new Error(res.error || "Failed to send digest");
      return res.data as { delivered: boolean; count: number };
    },
    onSuccess: (data, email) => {
      toast({
        title: "Digest sent",
        description: `Sent ${data.count} notifications to ${email}`,
      });
    },
    onError: () => {
      toast({ title: "Digest failed", description: "Unable to send digest", variant: "destructive" });
    },
  });

  const runEscalationsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiPost(`/api/notifications/run-escalations`, {});
      if (!res.ok) throw new Error(res.error || "Failed to process escalations");
      return res.data as { escalated: number };
    },
    onSuccess: (data) => {
      toast({ title: "Escalations processed", description: `${data.escalated} notifications escalated` });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    },
    onError: () => {
      toast({ title: "Escalations failed", description: "Unable to process escalations", variant: "destructive" });
    },
  });

  const upsertRuleMutation = useMutation({
    mutationFn: async (payload: RuleDraft) => {
      const endpoint = payload.id
        ? `/api/notifications/rules/${payload.id}`
        : `/api/notifications/rules`;
      const method = payload.id ? apiPut : apiPost;
      const res = await method(endpoint, {
        ...payload,
        steps: payload.steps.map(step => ({
          level: step.level,
          escalateAfterMinutes: step.escalateAfterMinutes,
          targetRole: step.targetRole,
          channel: step.channel,
          messageTemplate: step.messageTemplate ?? '',
        })),
      });
      if (!res.ok) throw new Error(res.error || "Failed to save routing rule");
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/rules"] });
      toast({ title: "Routing rule saved" });
    },
    onError: () => {
      toast({ title: "Save failed", description: "Unable to save routing rule", variant: "destructive" });
    },
  });

  const toggleChannel = (channel: NotificationChannel) => {
    setDraftRule(prev => {
      const exists = prev.deliveryChannels.includes(channel);
      return {
        ...prev,
        deliveryChannels: exists
          ? prev.deliveryChannels.filter(c => c !== channel)
          : [...prev.deliveryChannels, channel],
      };
    });
  };

  const updateStep = (index: number, updates: Partial<RuleStepDraft>) => {
    setDraftRule(prev => {
      const steps = prev.steps.map((step, i) =>
        i === index ? { ...step, ...updates } : step,
      );
      return { ...prev, steps };
    });
  };

  const addStep = () => {
    setDraftRule(prev => ({
      ...prev,
      steps: [
        ...prev.steps,
        {
          level: prev.steps.length + 1,
          escalateAfterMinutes: 60,
          targetRole: "management",
          channel: "email",
          messageTemplate: "",
          createdAt: null,
        },
      ],
    }));
  };

  const removeStep = (index: number) => {
    setDraftRule(prev => ({
      ...prev,
      steps: prev.steps.filter((_, i) => i !== index).map((step, i) => ({
        ...step,
        level: i + 1,
      })),
    }));
  };

  if (notificationsError || unreadError) {
    return <div>{t('errors.general')}</div>;
  }

  const getPriorityBadge = (priority: string) => {
    const variants = {
      low: "secondary",
      medium: "default", 
      high: "destructive",
      critical: "destructive"
    } as const;
    
    const colors = {
      low: "text-blue-600 bg-blue-100",
      medium: "text-yellow-600 bg-yellow-100",
      high: "text-orange-600 bg-orange-100", 
      critical: "text-red-600 bg-red-100"
    } as const;

    return (
      <Badge className={`${colors[priority as keyof typeof colors]} font-medium`}>
        {priority.toUpperCase()}
      </Badge>
    );
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'visa_expiry':
        return <FileText className="w-5 h-5 text-blue-600" />;
      case 'civil_id_expiry':
        return <CreditCard className="w-5 h-5 text-green-600" />;
      case 'passport_expiry':
        return <BookOpen className="w-5 h-5 text-purple-600" />;
      case 'driving_license_expiry':
        return <AlertTriangle className="w-5 h-5 text-amber-600" />;
      case 'vacation_return_due':
        return <CalendarCheck className="w-5 h-5 text-red-600" />;
      default:
        return <Bell className="w-5 h-5 text-gray-600" />;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'visa_expiry':
        return 'Visa Expiry';
      case 'civil_id_expiry':
        return 'Civil ID Expiry';
      case 'passport_expiry':
        return 'Passport Expiry';
      case 'driving_license_expiry':
        return 'Driving License Expiry';
      case 'vacation_return_due':
        return 'Vacation Return Due';
      default:
        return 'Notification';
    }
  };

  const getDateLabel = (type: string) =>
    type === 'vacation_return_due' ? 'Return Date' : 'Expiry Date';

  const getDaysLabel = (type: string) =>
    type === 'vacation_return_due' ? 'Days Until Return' : 'Days Until Expiry';

  const getUrgencyColor = (daysUntilExpiry: number) => {
    if (daysUntilExpiry <= 7) return 'text-red-600 bg-red-50 dark:text-red-300 dark:bg-red-950 border-red-200 dark:border-red-900';
    if (daysUntilExpiry <= 30) return 'text-orange-600 bg-orange-50 dark:text-orange-300 dark:bg-orange-950 border-orange-200 dark:border-orange-900';
    return 'text-gray-600 bg-gray-50 dark:text-gray-300 dark:bg-gray-900 border-gray-200 dark:border-gray-800';
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Notifications</h1>
        </div>
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="animate-pulse">
                  <div className="h-4 bg-gray-200 rounded w-1/4 mb-2"></div>
                  <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Notifications</h1>
          <p className="text-sm text-muted-foreground">
            Configure routing rules, send stakeholder digests, and monitor escalation paths.
          </p>
        </div>
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <div className="flex items-center gap-2">
            <Input
              type="email"
              placeholder="Digest recipient"
              value={digestEmail}
              onChange={event => setDigestEmail(event.target.value)}
              className="w-56"
            />
            <Button
              size="sm"
              onClick={handleDigestSend}
              disabled={digestMutation.isPending}
            >
              {digestMutation.isPending ? "Sending..." : "Send digest"}
            </Button>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => runEscalationsMutation.mutate()}
            disabled={runEscalationsMutation.isPending}
          >
            {runEscalationsMutation.isPending ? "Processing..." : "Run escalations"}
          </Button>
          <Badge variant="outline" className="text-sm">
            {unreadNotifications.length} {t('notifications.unread','unread')}
          </Badge>
        </div>
      </div>

      <Tabs defaultValue="notifications" className="space-y-6">
        <TabsList>
          <TabsTrigger value="notifications">Active alerts</TabsTrigger>
          <TabsTrigger value="rules">Routing rules</TabsTrigger>
        </TabsList>

        <TabsContent value="notifications" className="space-y-4">
          {notifications.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center">
                <Bell className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                  {t('notifications.none','No notifications')}
                </h3>
                <p className="text-gray-500 dark:text-gray-400">
                  {t('notifications.caughtUp',"You're all caught up! No document expiry alerts at this time.")}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {notifications.map((notification: NotificationWithEmployee) => (
                <Card
                  key={notification.id}
                  className={`${notification.status === 'unread' ? 'ring-2 ring-blue-200 dark:ring-blue-900 bg-blue-50/30 dark:bg-blue-950/30' : ''} ${getUrgencyColor(notification.daysUntilExpiry)} transition-all`}
                >
                  <CardHeader className="pb-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start space-x-3">
                        {getTypeIcon(notification.type)}
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 mb-1">
                            <CardTitle className="text-lg">{notification.title}</CardTitle>
                            {notification.status === 'unread' && (
                              <Badge variant="secondary" className="text-xs">New</Badge>
                            )}
                          </div>
                          <CardDescription className="text-sm">
                            {getTypeLabel(notification.type)} • {notification.employee?.firstName} {notification.employee?.lastName}
                          </CardDescription>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        {getPriorityBadge(notification.priority)}
                        <Badge variant={getEscalationStatusVariant(notification.escalationStatus)}>
                          {notification.escalationStatus.toUpperCase()}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="pt-0 space-y-4">
                    <div className="rounded-lg border bg-card text-card-foreground p-4 space-y-4">
                      <div>
                        <p className="text-gray-700 mb-3">{notification.message}</p>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <p className="text-gray-500 font-medium">Employee</p>
                            <p className="text-gray-900">{notification.employee?.firstName} {notification.employee?.lastName}</p>
                          </div>
                          <div>
                            <p className="text-gray-500 font-medium">{getDateLabel(notification.type)}</p>
                            <p className="text-gray-900">{format(new Date(notification.expiryDate), "MMM d, yyyy")}</p>
                          </div>
                          <div>
                            <p className="text-gray-500 font-medium">{getDaysLabel(notification.type)}</p>
                            <p className={`font-semibold ${notification.daysUntilExpiry <= 7 ? 'text-red-600' : notification.daysUntilExpiry <= 30 ? 'text-orange-600' : 'text-gray-900'}`}>
                              {notification.daysUntilExpiry} days
                            </p>
                          </div>
                          <div>
                            <p className="text-gray-500 font-medium">Created</p>
                            <p className="text-gray-900">{format(new Date(notification.createdAt || ''), "MMM d, h:mm a")}</p>
                          </div>
                          <div>
                            <p className="text-gray-500 font-medium">Delivery channels</p>
                            <p className="text-gray-900">
                              {notification.deliveryChannels?.length
                                ? notification.deliveryChannels.map(formatChannelLabel).join(', ')
                                : 'Default (Email)'}
                            </p>
                          </div>
                          <div>
                            <p className="text-gray-500 font-medium">Escalation level</p>
                            <p className="text-gray-900">{notification.escalationLevel ?? 0}</p>
                          </div>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Progress value={getSlaProgress(notification)} className="h-1.5" />
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>
                            SLA due {notification.slaDueAt ? format(new Date(notification.slaDueAt), "MMM d, h:mm a") : 'N/A'}
                          </span>
                          <span>Escalations: {notification.escalationHistory?.length ?? 0}</span>
                        </div>
                      </div>
                    </div>

                    {notification.escalationHistory?.length ? (
                      <div className="space-y-2 text-sm">
                        <p className="font-medium text-gray-700">Escalation history</p>
                        <ul className="space-y-1 text-muted-foreground">
                          {notification.escalationHistory.map((entry, index) => (
                            <li key={`${entry.escalatedAt}-${index}`}>
                              Level {entry.level} • {format(new Date(entry.escalatedAt), "MMM d, h:mm a")} via {formatChannelLabel(entry.channel as NotificationChannel)}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    <div className="flex items-center justify-between pt-2">
                      <div className="flex items-center space-x-2 text-sm text-gray-500">
                        <Clock className="w-4 h-4" />
                        <span>{format(new Date(notification.createdAt || ''), "MMM d, h:mm a")}</span>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {notification.status === 'unread' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => markAsReadMutation.mutate(notification.id)}
                            disabled={markAsReadMutation.isPending}
                          >
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Mark as read
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => snoozeMutation.mutate({ id: notification.id, days: 7 })}
                          disabled={snoozeMutation.isPending}
                        >
                          Snooze 7d
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEscalateClick(notification)}
                          disabled={escalateMutation.isPending}
                        >
                          Escalate now
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => deleteNotificationMutation.mutate(notification.id)}
                          disabled={deleteNotificationMutation.isPending}
                        >
                          Dismiss
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="rules" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Routing rules</CardTitle>
                <CardDescription>Manage escalation strategies for each notification trigger.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {rulesLoading ? (
                  <div className="space-y-2">
                    {[...Array(3)].map((_, index) => (
                      <div key={index} className="h-10 w-full animate-pulse rounded-md bg-muted" />
                    ))}
                  </div>
                ) : routingRules.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No routing rules configured yet.</p>
                ) : (
                        <div className="space-y-2">
                          {routingRules.map(rule => (
                            <button
                              key={rule.id}
                              type="button"
                              onClick={() => setSelectedRuleId(rule.id)}
                              className={`w-full rounded-md border px-3 py-2 text-left text-sm transition ${
                          selectedRuleId === rule.id ? 'border-primary bg-primary/10' : 'border-muted hover:border-primary'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{rule.name}</span>
                          <Badge variant="outline">{rule.triggerType}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">SLA {rule.slaMinutes} minutes • {rule.deliveryChannels?.join(', ') ?? 'email'}</p>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
              <CardFooter>
                <Button type="button" variant="outline" onClick={handleCreateRule}>
                  New rule
                </Button>
              </CardFooter>
            </Card>

            <Card>
              <form onSubmit={handleRuleSubmit} className="space-y-0">
                <CardHeader>
                  <CardTitle>{draftRule.id ? 'Edit rule' : 'Create rule'}</CardTitle>
                  <CardDescription>
                    Define SLA targets, delivery channels, and escalation sequencing.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3">
                    <div>
                      <Label htmlFor="rule-name">Name</Label>
                      <Input
                        id="rule-name"
                        value={draftRule.name}
                        onChange={event => setDraftRule(prev => ({ ...prev, name: event.target.value }))}
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="rule-trigger">Trigger type</Label>
                      <Input
                        id="rule-trigger"
                        value={draftRule.triggerType}
                        onChange={event => setDraftRule(prev => ({ ...prev, triggerType: event.target.value }))}
                        placeholder="e.g. visa_expiry"
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="rule-description">Description</Label>
                      <Textarea
                        id="rule-description"
                        value={draftRule.description ?? ''}
                        onChange={event => setDraftRule(prev => ({ ...prev, description: event.target.value }))}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label htmlFor="rule-sla">SLA (minutes)</Label>
                        <Input
                          id="rule-sla"
                          type="number"
                          value={draftRule.slaMinutes}
                          onChange={event => setDraftRule(prev => ({ ...prev, slaMinutes: Number(event.target.value) }))}
                          min={5}
                        />
                      </div>
                      <div>
                        <Label htmlFor="rule-strategy">Escalation strategy</Label>
                        <Input
                          id="rule-strategy"
                          value={draftRule.escalationStrategy}
                          onChange={event => setDraftRule(prev => ({ ...prev, escalationStrategy: event.target.value }))}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Delivery channels</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {channelOptions.map(channel => (
                        <label key={channel} className="flex items-center space-x-2 text-sm">
                          <Checkbox
                            checked={draftRule.deliveryChannels.includes(channel)}
                            onCheckedChange={() => toggleChannel(channel)}
                          />
                          <span>{formatChannelLabel(channel)}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <Separator />
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label>Escalation steps</Label>
                      <Button type="button" size="sm" variant="outline" onClick={addStep}>
                        Add step
                      </Button>
                    </div>
                    <div className="space-y-3">
                      {draftRule.steps.map((step, index) => (
                        <div key={index} className="rounded-md border p-3 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="font-medium">Step {index + 1}</span>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => removeStep(index)}
                              disabled={draftRule.steps.length === 1}
                            >
                              Remove
                            </Button>
                          </div>
                          <div className="grid gap-3 md:grid-cols-2">
                            <div>
                              <Label>Target role</Label>
                              <Input
                                value={step.targetRole ?? ''}
                                onChange={event => updateStep(index, { targetRole: event.target.value })}
                              />
                            </div>
                            <div>
                              <Label>Channel</Label>
                              <select
                                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                                value={step.channel}
                                onChange={event => updateStep(index, { channel: event.target.value })}
                              >
                                {channelOptions.map(channel => (
                                  <option key={channel} value={channel}>
                                    {formatChannelLabel(channel)}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <Label>Escalate after (minutes)</Label>
                              <Input
                                type="number"
                                value={step.escalateAfterMinutes ?? 0}
                                onChange={event => updateStep(index, { escalateAfterMinutes: Number(event.target.value) })}
                                min={0}
                              />
                            </div>
                            <div className="md:col-span-2">
                              <Label>Message template</Label>
                              <Textarea
                                value={step.messageTemplate ?? ''}
                                onChange={event => updateStep(index, { messageTemplate: event.target.value })}
                                placeholder="Use {{employeeName}} to reference the employee"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="flex justify-end">
                  <Button type="submit" disabled={upsertRuleMutation.isPending}>
                    {upsertRuleMutation.isPending ? 'Saving...' : 'Save rule'}
                  </Button>
                </CardFooter>
              </form>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
