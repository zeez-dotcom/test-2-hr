import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, FileText, CreditCard, BookOpen, Mail, Clock, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { queryClient } from "@/lib/queryClient";
import { apiPost } from "@/lib/http";
import { useToast } from "@/hooks/use-toast";
import { toastApiError } from "@/lib/toastError";
import type { DocumentExpiryCheck } from "@shared/schema";

export default function DocumentsPage() {
  const { toast } = useToast();

  const {
    data: expiryChecks = [],
    isLoading,
    error,
  } = useQuery<DocumentExpiryCheck[]>({
    queryKey: ["/api/documents/expiry-check"],
  });

  const sendAlertsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiPost("/api/documents/send-alerts");
      if (!res.ok) throw res;
      return res;
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents/expiry-check"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      toast({
        title: "Alerts Sent Successfully",
        description: `Generated ${(res.data as any).alertsGenerated} alerts, sent ${(res.data as any).emailsSent} emails`,
      });
    },
    onError: (res) => {
      toastApiError(res, "Failed to send alerts");
    },
  });

  if (error) {
    return <div>Error loading documents</div>;
  }

  const getDocumentIcon = (type: string) => {
    switch (type) {
      case 'visa':
        return <FileText className="w-5 h-5 text-blue-600" />;
      case 'civil_id':
        return <CreditCard className="w-5 h-5 text-green-600" />;
      case 'passport':
        return <BookOpen className="w-5 h-5 text-purple-600" />;
      default:
        return <FileText className="w-5 h-5 text-gray-600" />;
    }
  };

  const getUrgencyBadge = (daysUntilExpiry: number) => {
    if (daysUntilExpiry <= 7) {
      return <Badge className="bg-red-100 text-red-800 border-red-200">Critical - {daysUntilExpiry} days</Badge>;
    } else if (daysUntilExpiry <= 30) {
      return <Badge className="bg-orange-100 text-orange-800 border-orange-200">High - {daysUntilExpiry} days</Badge>;
    } else if (daysUntilExpiry <= 90) {
      return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">Medium - {daysUntilExpiry} days</Badge>;
    }
    return <Badge className="bg-gray-100 text-gray-800 border-gray-200">Low - {daysUntilExpiry} days</Badge>;
  };

  const getDocumentCards = (check: DocumentExpiryCheck) => {
    const cards = [];
    
    if (check.visa) {
      cards.push({
        type: 'visa',
        title: 'Visa',
        number: check.visa.number,
        expiryDate: check.visa.expiryDate,
        daysUntilExpiry: check.visa.daysUntilExpiry,
        alertDays: check.visa.alertDays,
      });
    }
    
    if (check.civilId) {
      cards.push({
        type: 'civil_id', 
        title: 'Civil ID',
        number: check.civilId.number,
        expiryDate: check.civilId.expiryDate,
        daysUntilExpiry: check.civilId.daysUntilExpiry,
        alertDays: check.civilId.alertDays,
      });
    }
    
    if (check.passport) {
      cards.push({
        type: 'passport',
        title: 'Passport',
        number: check.passport.number,
        expiryDate: check.passport.expiryDate,
        daysUntilExpiry: check.passport.daysUntilExpiry,
        alertDays: check.passport.alertDays,
      });
    }
    
    return cards;
  };

  const criticalExpiries = expiryChecks.filter((check: DocumentExpiryCheck) => 
    (check.visa && check.visa.daysUntilExpiry <= 7) ||
    (check.civilId && check.civilId.daysUntilExpiry <= 7) ||
    (check.passport && check.passport.daysUntilExpiry <= 7)
  );

  const upcomingExpiries = expiryChecks.filter((check: DocumentExpiryCheck) => 
    (check.visa && check.visa.daysUntilExpiry <= check.visa.alertDays) ||
    (check.civilId && check.civilId.daysUntilExpiry <= check.civilId.alertDays) ||
    (check.passport && check.passport.daysUntilExpiry <= check.passport.alertDays)
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Document Expiry Tracking</h1>
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
        <h1 className="text-3xl font-bold">Document Expiry Tracking</h1>
        <div className="flex items-center space-x-2">
          <Button
            onClick={() => sendAlertsMutation.mutate()}
            disabled={sendAlertsMutation.isPending}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {sendAlertsMutation.isPending ? (
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Mail className="w-4 h-4 mr-2" />
            )}
            Send Expiry Alerts
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border-red-200 bg-red-50">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg text-red-800">Critical Expiries</CardTitle>
            <CardDescription className="text-red-600">Documents expiring within 7 days</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-800">{criticalExpiries.length}</div>
          </CardContent>
        </Card>

        <Card className="border-orange-200 bg-orange-50">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg text-orange-800">Upcoming Expiries</CardTitle>
            <CardDescription className="text-orange-600">Documents requiring attention</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-800">{upcomingExpiries.length}</div>
          </CardContent>
        </Card>

        <Card className="border-blue-200 bg-blue-50">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg text-blue-800">Total Employees</CardTitle>
            <CardDescription className="text-blue-600">With document tracking</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-800">{expiryChecks.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Document Expiry List */}
      {expiryChecks.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center">
            <FileText className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No documents to track</h3>
            <p className="text-gray-500">Add document information to employees to start tracking expiry dates.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {expiryChecks.map((check: DocumentExpiryCheck) => (
            <Card key={check.employeeId} className="overflow-hidden">
              <CardHeader className="bg-gray-50 border-b">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-xl">{check.employeeName}</CardTitle>
                    <CardDescription>{check.email}</CardDescription>
                  </div>
                  <Badge variant="outline" className="text-sm">
                    {getDocumentCards(check).length} document{getDocumentCards(check).length !== 1 ? 's' : ''}
                  </Badge>
                </div>
              </CardHeader>
              
              <CardContent className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {getDocumentCards(check).map((doc) => (
                    <div key={doc.type} className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          {getDocumentIcon(doc.type)}
                          <h4 className="font-medium">{doc.title}</h4>
                        </div>
                        {getUrgencyBadge(doc.daysUntilExpiry)}
                      </div>
                      
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-500">Number:</span>
                          <span className="font-mono">{doc.number}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Expires:</span>
                          <span>{format(new Date(doc.expiryDate), "MMM d, yyyy")}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Alert set for:</span>
                          <span>{doc.alertDays} days before</span>
                        </div>
                      </div>

                      {doc.daysUntilExpiry <= doc.alertDays && (
                        <div className={`flex items-center space-x-1 text-xs p-2 rounded ${
                          doc.daysUntilExpiry <= 7 
                            ? 'bg-red-100 text-red-800' 
                            : doc.daysUntilExpiry <= 30 
                              ? 'bg-orange-100 text-orange-800'
                              : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          <AlertTriangle className="w-3 h-3" />
                          <span>Action required soon</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
