import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { apiPost, apiPut } from "@/lib/http";
import { toastApiError } from "@/lib/toastError";
import { CheckCircle, Users, AlertTriangle, Package } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  insertAssetSchema,
  insertAssetAssignmentSchema,
  type AssetWithAssignment,
  type AssetAssignmentWithDetails,
  type InsertAssetAssignment,
  type Employee
} from "@shared/schema";

export default function Assets() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const { toast } = useToast();
  const { t } = useTranslation();

  const {
    data: assets = [],
    error: assetsError,
  } = useQuery<AssetWithAssignment[]>({
    queryKey: ["/api/assets"],
  });

  const {
    data: assignments = [],
    error: assignmentsError,
  } = useQuery<AssetAssignmentWithDetails[]>({
    queryKey: ["/api/asset-assignments"],
  });

  const { data: employees = [], error: employeesError } = useQuery<Employee[]>({
    queryKey: ["/api/employees"],
  });

  // Upload document dialog state
  const [docAssetId, setDocAssetId] = useState<string | null>(null);
  const [docTitle, setDocTitle] = useState("");
  const [docFile, setDocFile] = useState<File | null>(null);
  const [repairsAsset, setRepairsAsset] = useState<any | null>(null);
  const repairsQuery = useQuery<any[]>({ queryKey: repairsAsset ? ["/api/assets", repairsAsset.id, "repairs"] : ["noop"], queryFn: async()=>{ const r = await fetch(`/api/assets/${repairsAsset!.id}/repairs`, { credentials:'include' }); return r.json(); }, enabled: !!repairsAsset });

  const createAssetRepairForm = () => ({
    repairDate: new Date().toISOString().split('T')[0],
    description: '',
    cost: '',
    vendor: '',
  });

  type AssetRepairFormState = ReturnType<typeof createAssetRepairForm>;

  const [repairForm, setRepairForm] = useState<AssetRepairFormState>(createAssetRepairForm());
  const [returnAssetDialog, setReturnAssetDialog] = useState<AssetWithAssignment | null>(null);
  const [returnRepairForm, setReturnRepairForm] = useState<AssetRepairFormState>(createAssetRepairForm());

  const buildAssetRepairPayload = (formValues: AssetRepairFormState) => {
    const payload: Record<string, string | number> = {
      repairDate: formValues.repairDate,
      description: formValues.description,
    };
    if (formValues.cost) {
      const numericCost = parseFloat(formValues.cost);
      if (!Number.isNaN(numericCost)) {
        payload.cost = numericCost;
      }
    }
    if (formValues.vendor) {
      payload.vendor = formValues.vendor;
    }
    return payload;
  };

  const submitAssetRepair = async (assetId: string, formValues: AssetRepairFormState) => {
    const payload = buildAssetRepairPayload(formValues);
    const res = await apiPost(`/api/assets/${assetId}/repairs`, payload);
    if (!res.ok) throw res;
  };

  const addRepair = useMutation({
    mutationFn: async () => {
      if (!repairsAsset) throw new Error('No asset selected');
      await submitAssetRepair(repairsAsset.id, repairForm);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey:["/api/assets", repairsAsset!.id, "repairs"]});
      setRepairForm(createAssetRepairForm());
    },
    onError: (err) => toastApiError(err as any, 'Failed to log repair'),
  });

  const returnAssetRepairMutation = useMutation({
    mutationFn: async ({ assetId, form }: { assetId: string; form: AssetRepairFormState }) => {
      await submitAssetRepair(assetId, form);
    },
    onError: (err) => toastApiError(err as any, 'Failed to log repair'),
  });
  const uploadDoc = useMutation({
    mutationFn: async () => {
      if (!docAssetId || !docTitle || !docFile) throw new Error('Missing fields');
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(docFile);
      });
      const res = await apiPost(`/api/assets/${docAssetId}/documents`, { title: docTitle, documentUrl: dataUrl });
      if (!res.ok) throw res;
      return res.data;
    },
    onSuccess: () => {
      setDocAssetId(null); setDocFile(null); setDocTitle("");
      toast({ title: t('assets.documentUploaded','Document uploaded') });
    },
    onError: (err) => toastApiError(err as any, t('assets.uploadFailed','Failed to upload document')),
  });

  const createAsset = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiPost("/api/assets", data);
      if (!res.ok) throw res;
      return res.data;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/assets"] });
      if (data?.id) {
        queryClient.invalidateQueries({ queryKey: ["/api/assets", data.id] });
      }
      setIsCreateOpen(false);
      toast({ title: t('assets.created','Asset created') });
    },
    onError: (err) => toastApiError(err as any, t('assets.createFailed','Failed to create asset')),
  });

  const assetStatusMutation = useMutation<
    any,
    unknown,
    { assetId: string; status: string; toastMessage?: string }
  >({
    mutationFn: async ({ assetId, status }: { assetId: string; status: string }) => {
      const res = await apiPost(`/api/assets/${assetId}/status`, { status });
      if (!res.ok) throw res;
      return res.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/assets"] });
      if (variables.assetId) {
        queryClient.invalidateQueries({ queryKey: ["/api/assets", variables.assetId] });
      }
      const message =
        variables.toastMessage ??
        (variables.status === "maintenance"
          ? t('assets.markedMaintenance', 'Asset marked for maintenance')
          : t('assets.backInService', 'Asset returned to service'));
      toast({ title: message });
    },
    onError: (err) => toastApiError(err as any, t('assets.statusUpdateFailed', 'Failed to update asset status')),
  });

  const updateAssetAssignmentStatus = useMutation<
    any,
    unknown,
    {
      assignmentId: string;
      status: string;
      assetId: string;
      returnDate?: string;
      notes?: string | null;
      assetStatus?: string;
    }
  >({
    mutationFn: async ({ assignmentId, status, returnDate, notes }) => {
      const payload: Record<string, string> = { status };
      if (returnDate) {
        payload.returnDate = returnDate;
      }
      if (typeof notes === "string" && notes.trim().length > 0) {
        payload.notes = notes.trim();
      }
      const res = await apiPut(`/api/asset-assignments/${assignmentId}`, payload);
      if (!res.ok) throw res;
      return res.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/assets"] });
      if (variables.assetId) {
        queryClient.invalidateQueries({ queryKey: ["/api/assets", variables.assetId] });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/asset-assignments"] });
      if (variables.assetId) {
        queryClient.invalidateQueries({ queryKey: ["/api/asset-assignments", variables.assetId] });
      }
      if (variables.status === "completed") {
        setReturnAssetDialog(null);
        setRepairsAsset(null);
        setReturnRepairForm(createAssetRepairForm());
      }
      if (variables.assetId && (variables.status || variables.assetStatus)) {
        const assetStatus = variables.assetStatus ?? variables.status;
        if (assetStatus) {
          const toastMessage =
            variables.status === "completed" && assetStatus === "available"
              ? t('assets.returnSuccess', 'Asset returned successfully')
              : undefined;
          assetStatusMutation.mutate({
            assetId: variables.assetId,
            status: assetStatus,
            toastMessage,
          });
        }
      } else if (variables.status === "completed") {
        toast({ title: t('assets.returnSuccess', 'Asset returned successfully') });
      }
    },
    onError: (err) => toastApiError(err as any, t('assets.statusUpdateFailed', 'Failed to update asset status')),
  });

  const assignAsset = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiPost("/api/asset-assignments", data);
      if (!res.ok) {
        toast({ title: t('assets.assignFailed','Failed to assign asset'), description: res.error, variant: "destructive" });
        throw res;
      }
      return data;
    },
    onSuccess: (_, data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/assets"] });
      if (data?.assetId) {
        queryClient.invalidateQueries({ queryKey: ["/api/assets", data.assetId] });
        queryClient.invalidateQueries({ queryKey: ["/api/asset-assignments", data.assetId] });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/asset-assignments"] });
      setIsAssignOpen(false);
      toast({ title: t('assets.assigned','Asset assigned') });
    },
  });

  const assetForm = useForm({
    resolver: zodResolver(insertAssetSchema),
    defaultValues: {
      name: "",
      type: "",
      status: "available",
      details: "",
    },
  });

  const assignmentForm = useForm<InsertAssetAssignment>({
    resolver: zodResolver(insertAssetAssignmentSchema),
    defaultValues: {
      assetId: "",
      employeeId: "",
      assignedDate: new Date().toISOString().split("T")[0],
      status: "active",
      notes: "",
    },
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "available":
        return <Badge className="bg-green-100 text-green-800"><CheckCircle className="w-3 h-3 mr-1" />Available</Badge>;
      case "assigned":
        return <Badge className="bg-blue-100 text-blue-800"><Users className="w-3 h-3 mr-1" />Assigned</Badge>;
      case "maintenance":
        return <Badge variant="destructive"><AlertTriangle className="w-3 h-3 mr-1" />Maintenance</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  if (assetsError || assignmentsError || employeesError) {
    return <div>Error loading assets</div>;
  }

  const availableAssets = assets.filter(a => a.status === "available");
  const assignedAssets = assets.filter(a => a.status === "assigned");
  const maintenanceAssets = assets.filter(a => a.status === "maintenance");
  const activeAssignments = assignments.filter((assignment) => assignment.status === "active");
  const historyAssignments = assignments
    .filter((assignment) => assignment.status !== "active")
    .sort((a, b) => {
      const getSortDate = (value?: string | null) => {
        if (!value) return 0;
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? 0 : date.getTime();
      };
      const bDate = getSortDate(b.returnDate ?? b.assignedDate);
      const aDate = getSortDate(a.returnDate ?? a.assignedDate);
      return bDate - aDate;
    });

  const totalAssets = assets.length;
  const availableCount = availableAssets.length;
  const assignedCount = assignedAssets.length;
  const maintenanceCount = maintenanceAssets.length;

  const formatDate = (value?: string | null) => (value ? new Date(value).toLocaleDateString() : "—");

  const onSubmitAsset = (data: any) => createAsset.mutate(data);
  const onSubmitAssignment = (data: any) => assignAsset.mutate(data);

  const handleAssetStatusChange = (
    asset: AssetWithAssignment,
    status: "available" | "maintenance" | "assigned"
  ) => {
    if (asset.status === "maintenance" && status === "available") {
      setReturnAssetDialog(asset);
      setReturnRepairForm(createAssetRepairForm());
      return;
    }

    if (status === "maintenance") {
      const activeAssignment =
        asset.currentAssignment ??
        activeAssignments.find(assignment => assignment.assetId === asset.id && assignment.status === "active");
      if (activeAssignment?.id) {
        const today = new Date().toISOString().split("T")[0];
        updateAssetAssignmentStatus.mutate({
          assignmentId: activeAssignment.id,
          assetId: asset.id,
          status: "maintenance",
          ...(activeAssignment.returnDate ? {} : { returnDate: today }),
        });
        return;
      }
    }

    assetStatusMutation.mutate({ assetId: asset.id, status });
  };

  const handleReturnAssetToService = async () => {
    if (!returnAssetDialog) return;
    try {
      await returnAssetRepairMutation.mutateAsync({
        assetId: returnAssetDialog.id,
        form: returnRepairForm,
      });
      await assetStatusMutation.mutateAsync({
        assetId: returnAssetDialog.id,
        status: "available",
      });
      setReturnAssetDialog(null);
      setReturnRepairForm(createAssetRepairForm());
    } catch (err) {
      // Errors are handled by the respective mutations
    }
  };

  const isReturningAsset = returnAssetRepairMutation.isPending || assetStatusMutation.isPending;

  const handleReturnAsset = (assignmentId: string) => {
    const assignment = assignments.find((item) => item.id === assignmentId);
    if (!assignment) return;

    const confirmed = window.confirm(
      t('assets.confirmReturn', 'Are you sure you want to mark this asset as returned?')
    );
    if (!confirmed) return;

    const today = new Date().toISOString().split("T")[0];
    const existingNotes = assignment.notes?.trim();

    updateAssetAssignmentStatus.mutate({
      assignmentId: assignment.id,
      assetId: assignment.assetId,
      status: "completed",
      returnDate: today,
      ...(existingNotes ? { notes: existingNotes } : {}),
      assetStatus: "available",
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold tracking-tight">Assets</h1>
        <div className="space-x-2">
          <Dialog open={isAssignOpen} onOpenChange={setIsAssignOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">Assign Asset</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Assign Asset</DialogTitle>
                <DialogDescription>
                  Select an asset, employee, assignment date, and add optional notes.
                </DialogDescription>
              </DialogHeader>
              <Form {...assignmentForm}>
                <form onSubmit={assignmentForm.handleSubmit(onSubmitAssignment)} className="space-y-4">
                  <FormField
                    control={assignmentForm.control}
                    name="assetId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Asset</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || undefined}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select asset" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {availableAssets.map(a => (
                              <SelectItem key={a.id} value={a.id}>
                                {a.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={assignmentForm.control}
                    name="employeeId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Employee</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || undefined}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select employee" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {employees.map((emp) => (
                              <SelectItem key={emp.id} value={emp.id}>
                                {emp.firstName} {emp.lastName}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={assignmentForm.control}
                    name="assignedDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Assignment Date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={assignmentForm.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Notes (Optional)</FormLabel>
                        <FormControl>
                          <Textarea placeholder="Assignment notes..." {...field} value={field.value || ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit">Assign</Button>
                </form>
              </Form>
            </DialogContent>
          </Dialog>

          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button>Create Asset</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>New Asset</DialogTitle>
              </DialogHeader>
              <Form {...assetForm}>
                <form onSubmit={assetForm.handleSubmit(onSubmitAsset)} className="space-y-4">
                  <FormField
                    control={assetForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Name</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={assetForm.control}
                    name="type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Type</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={assetForm.control}
                    name="details"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Details</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit">Save</Button>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Assets Overview</TabsTrigger>
          <TabsTrigger value="active-assignments">Active Assignments</TabsTrigger>
          <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
          <TabsTrigger value="history">{t('assets.historyTab', 'Assignment History')}</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Assets</CardTitle>
                <Package className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalAssets}</div>
                <p className="text-xs text-muted-foreground">All tracked assets</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Available</CardTitle>
                <CheckCircle className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{availableCount}</div>
                <p className="text-xs text-muted-foreground">Ready for assignment</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Assigned</CardTitle>
                <Users className="h-4 w-4 text-blue-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">{assignedCount}</div>
                <p className="text-xs text-muted-foreground">Currently in use</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Maintenance</CardTitle>
                <AlertTriangle className="h-4 w-4 text-amber-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-amber-500">{maintenanceCount}</div>
                <p className="text-xs text-muted-foreground">Requires attention</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {assets.length === 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>No assets found</CardTitle>
                  <CardDescription>Add assets to get started.</CardDescription>
                </CardHeader>
              </Card>
            ) : (
              assets.map(asset => (
                <div key={asset.id} className="border rounded p-4 space-y-2">
                  <div className="font-medium">{asset.name}</div>
                  <div className="text-sm text-muted-foreground">{asset.type}</div>
                  <div className="text-sm flex items-center space-x-1">
                    <span>Status:</span>
                    {getStatusBadge(asset.status)}
                  </div>
                  {asset.currentAssignment && (
                    <div className="text-sm">
                      Assigned to: {asset.currentAssignment.employee?.firstName} {asset.currentAssignment.employee?.lastName}
                    </div>
                  )}
                  <div>
                    <Button size="sm" variant="outline" onClick={() => window.open(`/asset-file?id=${encodeURIComponent(asset.id)}`, '_blank')}>Print</Button>
                    <Button size="sm" variant="outline" className="ml-2" onClick={() => setDocAssetId(asset.id)}>Add Document</Button>
                    <Button size="sm" variant="outline" className="ml-2" onClick={() => setRepairsAsset(asset)}>Repairs</Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="ml-2"
                      disabled={
                        (assetStatusMutation.isPending &&
                          assetStatusMutation.variables?.assetId === asset.id) ||
                        (updateAssetAssignmentStatus.isPending &&
                          updateAssetAssignmentStatus.variables?.assetId === asset.id)
                      }
                      onClick={() =>
                        handleAssetStatusChange(
                          asset,
                          asset.status === "maintenance" ? "available" : "maintenance",
                        )
                      }
                    >
                      {asset.status === "maintenance" ? "Back to Service" : "Mark as Maintenance"}
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="active-assignments" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Active Assignments</CardTitle>
              <CardDescription>Assets currently assigned to employees.</CardDescription>
            </CardHeader>
            <CardContent>
              {activeAssignments.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Asset</TableHead>
                      <TableHead>Employee</TableHead>
                      <TableHead>Assignment Date</TableHead>
                      <TableHead>Expected Return</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead className="text-right">{t('assets.actions', 'Actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activeAssignments.map((assignment) => (
                      <TableRow key={assignment.id}>
                        <TableCell>{assignment.asset?.name || "Unknown asset"}</TableCell>
                        <TableCell>
                          {assignment.employee
                            ? `${assignment.employee.firstName ?? ""} ${assignment.employee.lastName ?? ""}`.trim() || "Unnamed employee"
                            : "Unknown employee"}
                        </TableCell>
                        <TableCell>{formatDate(assignment.assignedDate)}</TableCell>
                        <TableCell>{formatDate(assignment.returnDate)}</TableCell>
                        <TableCell className="max-w-xs whitespace-pre-wrap">{assignment.notes?.trim() || "—"}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={
                              updateAssetAssignmentStatus.isPending &&
                              updateAssetAssignmentStatus.variables?.assignmentId === assignment.id
                            }
                            onClick={() => handleReturnAsset(assignment.id)}
                          >
                            {t('assets.returnAsset', 'Return Asset')}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground">No active assignments.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="maintenance" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Assets in Maintenance</CardTitle>
              <CardDescription>Equipment currently unavailable while maintenance is in progress.</CardDescription>
            </CardHeader>
            <CardContent>
              {maintenanceAssets.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Asset</TableHead>
                      <TableHead>Assignment</TableHead>
                      <TableHead>Dates</TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {maintenanceAssets.map((asset) => {
                      const maintenanceRecord =
                        assignments.find(
                          (assignment) => assignment.assetId === asset.id && assignment.status === "maintenance",
                        ) ?? asset.currentAssignment;
                      const employee = maintenanceRecord?.employee;
                      const employeeName = employee
                        ? `${employee.firstName ?? ""} ${employee.lastName ?? ""}`.trim() || "Unnamed employee"
                        : null;
                      const maintenanceNotes =
                        maintenanceRecord?.notes ?? asset.currentAssignment?.notes ?? asset.details ?? "";

                      return (
                        <TableRow key={asset.id}>
                          <TableCell>
                            <div className="font-medium">{asset.name}</div>
                            <div className="text-sm text-muted-foreground">{asset.type}</div>
                            <div className="mt-2">{getStatusBadge(asset.status)}</div>
                          </TableCell>
                          <TableCell>
                            {employeeName ? (
                              <div className="space-y-1 text-sm">
                                <div className="font-medium">{employeeName}</div>
                                {employee?.phone && <div className="text-muted-foreground">{employee.phone}</div>}
                              </div>
                            ) : (
                              <span className="text-sm text-muted-foreground">Not currently assigned</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1 text-sm">
                              <div>Assigned: {formatDate(maintenanceRecord?.assignedDate)}</div>
                              <div>Returned: {formatDate(maintenanceRecord?.returnDate)}</div>
                            </div>
                          </TableCell>
                          <TableCell>
                            {maintenanceNotes ? (
                              <div className="text-sm whitespace-pre-wrap leading-relaxed">{maintenanceNotes}</div>
                            ) : (
                              <span className="text-sm text-muted-foreground">No notes recorded.</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              ) : (
                <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-muted-foreground/30 bg-muted/20 p-6 text-sm text-muted-foreground">
                  <Package className="h-10 w-10 text-gray-400" />
                  No assets are currently marked for maintenance.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t('assets.historyTab', 'Assignment History')}</CardTitle>
              <CardDescription>
                {t('assets.historyDescription', 'Review past asset assignments and returns.')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {historyAssignments.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('assets.historyAsset', 'Asset')}</TableHead>
                        <TableHead>{t('assets.historyEmployee', 'Employee')}</TableHead>
                        <TableHead>{t('assets.historyPeriod', 'Assignment Period')}</TableHead>
                        <TableHead>{t('assets.historyNotes', 'Notes')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {historyAssignments.map((assignment) => {
                        const assetName = assignment.asset?.name?.trim();
                        const assetType = assignment.asset?.type?.trim();
                        const employeeName = assignment.employee
                          ? `${assignment.employee.firstName ?? ""} ${assignment.employee.lastName ?? ""}`.trim()
                          : "";
                        const employeePhone = assignment.employee?.phone?.trim();
                        const assignedDate = formatDate(assignment.assignedDate);
                        const returnDate = assignment.returnDate
                          ? formatDate(assignment.returnDate)
                          : t('assets.historyPresent', 'Present');
                        const notes = assignment.notes?.trim() ?? "";

                        return (
                          <TableRow key={assignment.id}>
                            <TableCell>
                              <div className="font-medium">
                                {assetName || t('assets.historyUnknownAsset', 'Unknown asset')}
                              </div>
                              {assetType && (
                                <div className="text-sm text-muted-foreground">{assetType}</div>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="font-medium">
                                {employeeName || t('assets.historyUnknownEmployee', 'Unknown employee')}
                              </div>
                              {employeePhone && (
                                <div className="text-sm text-muted-foreground">{employeePhone}</div>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="text-sm font-medium">{assignedDate} – {returnDate}</div>
                            </TableCell>
                            <TableCell>
                              {notes ? (
                                <div className="text-sm whitespace-pre-wrap leading-relaxed">{notes}</div>
                              ) : (
                                <span className="text-sm text-muted-foreground">
                                  {t('assets.historyNoNotes', 'No notes recorded.')}
                                </span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-muted-foreground/30 bg-muted/20 p-6 text-center text-sm text-muted-foreground">
                  <Package className="mx-auto h-10 w-10 text-gray-400" />
                  <h3 className="text-base font-medium text-foreground">
                    {t('assets.historyEmpty', 'No past assignments found.')}
                  </h3>
                  <p>{t('assets.historyEmptyHint', 'Completed assignments will appear here once available.')}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Return to service dialog */}
      <Dialog
        open={!!returnAssetDialog}
        onOpenChange={(open) => {
          if (!open) {
            setReturnAssetDialog(null);
            setReturnRepairForm(createAssetRepairForm());
          }
        }}
      >
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Return Asset to Service</DialogTitle>
            <DialogDescription>
              {`Record the maintenance details before returning ${returnAssetDialog?.name ?? 'this asset'} to service.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="asset-return-repair-date">Repair Date</label>
              <Input
                id="asset-return-repair-date"
                type="date"
                value={returnRepairForm.repairDate}
                onChange={(e) => setReturnRepairForm((s) => ({ ...s, repairDate: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="asset-return-repair-description">Description</label>
              <Textarea
                id="asset-return-repair-description"
                placeholder="What was repaired?"
                value={returnRepairForm.description}
                onChange={(e) => setReturnRepairForm((s) => ({ ...s, description: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="asset-return-repair-cost">Cost (optional)</label>
                <Input
                  id="asset-return-repair-cost"
                  type="number"
                  value={returnRepairForm.cost}
                  onChange={(e) => setReturnRepairForm((s) => ({ ...s, cost: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="asset-return-repair-vendor">Vendor (optional)</label>
                <Input
                  id="asset-return-repair-vendor"
                  value={returnRepairForm.vendor}
                  onChange={(e) => setReturnRepairForm((s) => ({ ...s, vendor: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={handleReturnAssetToService}
              disabled={isReturningAsset || !returnRepairForm.description}
            >
              {isReturningAsset ? 'Returning...' : 'Return to Service'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upload document dialog */}
      <Dialog open={!!docAssetId} onOpenChange={(o)=>!o&&setDocAssetId(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Upload Asset Document</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Title" value={docTitle} onChange={e=>setDocTitle(e.target.value)} />
            <Input type="file" onChange={e=> setDocFile(e.target.files?.[0] || null)} />
            <div className="flex justify-end">
              <Button onClick={()=>uploadDoc.mutate()} disabled={uploadDoc.isPending || !docTitle || !docFile}>Upload</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Repairs dialog */}
      <Dialog open={!!repairsAsset} onOpenChange={(o)=> !o && setRepairsAsset(null)}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader><DialogTitle>Repairs - {repairsAsset?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            {(repairsQuery?.data || []).map((r:any)=>(
              <div key={r.id} className="border rounded p-2 text-sm">
                <div className="flex justify-between">
                  <div className="font-medium">{r.vendor || 'Repair'}</div>
                  <div>{r.repairDate}</div>
                </div>
                <div className="mt-1">{r.description}</div>
                <div className="text-muted-foreground">Cost: {r.cost ?? 'N/A'}</div>
                {r.documentUrl && (<a className="text-blue-600 underline" href={r.documentUrl} target="_blank">View</a>)}
              </div>
            ))}
            <div className="border-t pt-3">
              <div className="text-sm font-medium mb-2">Add Repair</div>
              <div className="grid grid-cols-2 gap-2">
                <Input type="date" value={repairForm.repairDate} onChange={e=> setRepairForm(s=> ({...s, repairDate: e.target.value}))} />
                <Input placeholder="Vendor" value={repairForm.vendor} onChange={e=> setRepairForm(s=> ({...s, vendor: e.target.value}))} />
                <Input className="col-span-2" placeholder="Description" value={repairForm.description} onChange={e=> setRepairForm(s=> ({...s, description: e.target.value}))} />
                <Input placeholder="Cost" value={repairForm.cost} onChange={e=> setRepairForm(s=> ({...s, cost: e.target.value}))} />
                <div className="flex justify-end col-span-2"><Button size="sm" onClick={()=> addRepair.mutate()} disabled={addRepair.isPending || !repairForm.description}>Save</Button></div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
