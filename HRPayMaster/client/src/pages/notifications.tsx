import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Bell, CheckCircle, Clock, AlertTriangle, FileText, CreditCard, BookOpen } from "lucide-react";
import { format } from "date-fns";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { NotificationWithEmployee } from "@shared/schema";

export default function NotificationsPage() {
  const { toast } = useToast();

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ["/api/notifications"],
  });

  const { data: unreadNotifications = [] } = useQuery({
    queryKey: ["/api/notifications/unread"],
  });

  const markAsReadMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/notifications/${id}/read`, {
      method: "PUT",
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread"] });
      toast({
        title: "Success",
        description: "Notification marked as read",
      });
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
    mutationFn: (id: string) => apiRequest(`/api/notifications/${id}`, {
      method: "DELETE",
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread"] });
      toast({
        title: "Success",
        description: "Notification deleted",
      });
    },
    onError: () => {
      toast({
        title: "Error", 
        description: "Failed to delete notification",
        variant: "destructive",
      });
    },
  });

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
      default:
        return 'Notification';
    }
  };

  const getUrgencyColor = (daysUntilExpiry: number) => {
    if (daysUntilExpiry <= 7) return 'text-red-600 bg-red-50 border-red-200';
    if (daysUntilExpiry <= 30) return 'text-orange-600 bg-orange-50 border-orange-200';
    return 'text-gray-600 bg-gray-50 border-gray-200';
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
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Notifications</h1>
        <div className="flex items-center space-x-2">
          <Badge variant="outline" className="text-sm">
            {unreadNotifications.length} unread
          </Badge>
        </div>
      </div>

      {notifications.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center">
            <Bell className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No notifications</h3>
            <p className="text-gray-500">You're all caught up! No document expiry alerts at this time.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {notifications.map((notification: NotificationWithEmployee) => (
            <Card key={notification.id} className={`${notification.status === 'unread' ? 'ring-2 ring-blue-200 bg-blue-50/30' : ''} ${getUrgencyColor(notification.daysUntilExpiry)} transition-all`}>
              <CardHeader className="pb-4">
                <div className="flex items-start justify-between">
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
                  </div>
                </div>
              </CardHeader>
              
              <CardContent className="pt-0">
                <div className="space-y-4">
                  <div className="bg-white rounded-lg p-4 border">
                    <p className="text-gray-700 mb-3">{notification.message}</p>
                    
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-gray-500 font-medium">Employee</p>
                        <p className="text-gray-900">{notification.employee?.firstName} {notification.employee?.lastName}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 font-medium">Expiry Date</p>
                        <p className="text-gray-900">{format(new Date(notification.expiryDate), "MMM d, yyyy")}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 font-medium">Days Until Expiry</p>
                        <p className={`font-semibold ${notification.daysUntilExpiry <= 7 ? 'text-red-600' : notification.daysUntilExpiry <= 30 ? 'text-orange-600' : 'text-gray-900'}`}>
                          {notification.daysUntilExpiry} days
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-500 font-medium">Created</p>
                        <p className="text-gray-900">{format(new Date(notification.createdAt || ''), "MMM d, h:mm a")}</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <div className="flex items-center space-x-2 text-sm text-gray-500">
                      <Clock className="w-4 h-4" />
                      <span>{format(new Date(notification.createdAt || ''), "MMM d, h:mm a")}</span>
                    </div>
                    
                    <div className="flex space-x-2">
                      {notification.status === 'unread' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => markAsReadMutation.mutate(notification.id)}
                          disabled={markAsReadMutation.isPending}
                        >
                          <CheckCircle className="w-3 h-3 mr-1" />
                          Mark as Read
                        </Button>
                      )}
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
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}