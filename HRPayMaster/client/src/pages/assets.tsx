import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { apiDelete, apiPost, apiPut } from "@/lib/http";
import { toastApiError } from "@/lib/toastError";
import { CheckCircle, Users, AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  insertAssetSchema,
  insertAssetAssignmentSchema,
  type AssetWithAssignment,
  type AssetAssignmentWithDetails,
  type InsertAssetAssignment,
  type Employee
} from "@shared/schema";

function createAssignmentDefaultValues(): InsertAssetAssignment {
  return {
    assetId: "",
    employeeId: "",
    assignedDate: new Date().toISOString().split("T")[0],
    status: "active",
    notes: "",
  };
}

function formatStatusLabel(status: string) {
  if (!status) return "";
  return status
    .split(/[\s_-]+/)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function Assets() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<AssetAssignmentWithDetails | null>(null);
  const [isUnassignConfirmOpen, setIsUnassignConfirmOpen] = useState(false);
  const [assignmentToUnassign, setAssignmentToUnassign] = useState<AssetAssignmentWithDetails | null>(null);
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
  const [repairForm, setRepairForm] = useState({ repairDate: new Date().toISOString().split('T')[0], description: '', cost: '', vendor: '' });
  const addRepair = useMutation({ mutationFn: async () => { if (!repairsAsset) return; const payload:any = { ...repairForm }; if (!payload.cost) delete payload.cost; const res = await apiPost(`/api/assets/${repairsAsset.id}/repairs`, payload); if (!(res as any).ok) throw res; }, onSuccess: ()=>{ queryClient.invalidateQueries({ queryKey:["/api/assets", repairsAsset!.id, "repairs"]}); setRepairForm({ repairDate: new Date().toISOString().split('T')[0], description:'', cost:'', vendor:'' }); } });
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
      handleAssignOpenChange(false);
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
    defaultValues: createAssignmentDefaultValues(),
  });

  const editAssignmentForm = useForm<InsertAssetAssignment>({
    resolver: zodResolver(insertAssetAssignmentSchema),
    defaultValues: createAssignmentDefaultValues(),
  });

  const createStatusValue = assignmentForm.watch("status");

  const assignmentStatusOptions = useMemo(() => {
    const statuses = new Set<string>(["active", "completed"]);
    assignments.forEach(assignment => {
      if (assignment.status) {
        statuses.add(assignment.status);
      }
    });
    if (selectedAssignment?.status) {
      statuses.add(selectedAssignment.status);
    }
    if (createStatusValue) {
      statuses.add(createStatusValue);
    }
    const result = Array.from(statuses);
    const order = ["active", "completed"];
    result.sort((a, b) => {
      const ai = order.indexOf(a);
      const bi = order.indexOf(b);
      if (ai === -1 && bi === -1) {
        return a.localeCompare(b);
      }
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
    return result;
  }, [assignments, createStatusValue, selectedAssignment?.status]);

  const updateAssignment = useMutation({
    mutationFn: async ({
      id,
      assetId,
      payload,
    }: {
      id: string;
      assetId: string;
      payload: Partial<InsertAssetAssignment>;
    }) => {
      const res = await apiPut(`/api/asset-assignments/${id}`, payload);
      if (!res.ok) throw res;
      return { data: res.data, assetId, id };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/assets"] });
      if (variables.assetId) {
        queryClient.invalidateQueries({ queryKey: ["/api/assets", variables.assetId] });
        queryClient.invalidateQueries({ queryKey: ["/api/asset-assignments", variables.assetId] });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/asset-assignments"] });
      toast({ title: t("assets.assignmentUpdated", "Assignment updated") });
      setIsEditOpen(false);
      setSelectedAssignment(null);
      editAssignmentForm.reset(createAssignmentDefaultValues());
    },
    onError: (err) => {
      toastApiError(err as any, t("assets.updateFailed", "Failed to update assignment"));
    },
  });

  const unassignAsset = useMutation({
    mutationFn: async ({ id, assetId }: { id: string; assetId: string }) => {
      const res = await apiDelete(`/api/asset-assignments/${id}`);
      if (!res.ok) throw res;
      return { assetId, id };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/assets"] });
      if (variables.assetId) {
        queryClient.invalidateQueries({ queryKey: ["/api/assets", variables.assetId] });
        queryClient.invalidateQueries({ queryKey: ["/api/asset-assignments", variables.assetId] });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/asset-assignments"] });
      toast({ title: t("assets.assignmentRemoved", "Asset unassigned") });
      setAssignmentToUnassign(null);
      setIsUnassignConfirmOpen(false);
    },
    onError: (err) => {
      toastApiError(err as any, t("assets.unassignFailed", "Failed to unassign asset"));
      setAssignmentToUnassign(null);
      setIsUnassignConfirmOpen(false);
    },
  });

  const handleAssignOpenChange = (open: boolean) => {
    setIsAssignOpen(open);
    if (!open) {
      assignmentForm.reset(createAssignmentDefaultValues());
    }
  };

  const handleEditDialogChange = (open: boolean) => {
    setIsEditOpen(open);
    if (!open) {
      setSelectedAssignment(null);
      editAssignmentForm.reset(createAssignmentDefaultValues());
    }
  };

  const handleUnassignDialogChange = (open: boolean) => {
    setIsUnassignConfirmOpen(open);
    if (!open) {
      setAssignmentToUnassign(null);
    }
  };

  const handleEditAssignmentClick = (assignmentId: string) => {
    const assignment = assignments.find(a => a.id === assignmentId);
    if (!assignment) return;
    setSelectedAssignment(assignment);
    editAssignmentForm.reset({
      assetId: assignment.assetId,
      employeeId: assignment.employeeId,
      assignedDate: assignment.assignedDate ?? new Date().toISOString().split("T")[0],
      status: assignment.status ?? "active",
      notes: assignment.notes ?? "",
      returnDate: assignment.returnDate ?? undefined,
    });
    setIsEditOpen(true);
  };

  const handleUnassignClick = (assignmentId: string) => {
    const assignment = assignments.find(a => a.id === assignmentId);
    if (!assignment) return;
    setAssignmentToUnassign(assignment);
    setIsUnassignConfirmOpen(true);
  };

  const handleConfirmUnassign = () => {
    if (!assignmentToUnassign) return;
    unassignAsset.mutate({ id: assignmentToUnassign.id, assetId: assignmentToUnassign.assetId });
  };

  const onSubmitEditAssignment = (data: InsertAssetAssignment) => {
    if (!selectedAssignment) return;
    updateAssignment.mutate({
      id: selectedAssignment.id,
      assetId: selectedAssignment.assetId,
      payload: {
        assignedDate: data.assignedDate,
        status: data.status,
        notes: data.notes ?? "",
      },
    });
  };

  const unassignAssetName =
    assignmentToUnassign?.asset?.name ??
    (assignmentToUnassign ? assets.find(a => a.id === assignmentToUnassign.assetId)?.name : undefined);

  const unassignEmployeeDetails =
    assignmentToUnassign?.employee ??
    (assignmentToUnassign
      ? employees.find(emp => emp.id === assignmentToUnassign.employeeId)
      : undefined);

  const unassignEmployeeName = unassignEmployeeDetails
    ? `${unassignEmployeeDetails.firstName ?? ""} ${unassignEmployeeDetails.lastName ?? ""}`.trim() || undefined
    : undefined;

  const unassignDescription = assignmentToUnassign
    ? `This will unassign ${unassignAssetName ?? "this asset"} from ${unassignEmployeeName ?? "this employee"}.`
    : undefined;

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

  const onSubmitAsset = (data: any) => createAsset.mutate(data);
  const onSubmitAssignment = (data: InsertAssetAssignment) => assignAsset.mutate(data);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold tracking-tight">Assets</h1>
        <div className="space-x-2">
          <Dialog open={isAssignOpen} onOpenChange={handleAssignOpenChange}>
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
              <AssetAssignmentForm
                form={assignmentForm}
                assetOptions={availableAssets}
                employees={employees}
                onSubmit={onSubmitAssignment}
                submitLabel="Assign"
                statusOptions={assignmentStatusOptions}
                submitting={assignAsset.isPending}
              />
            </DialogContent>
          </Dialog>

          <Dialog open={isEditOpen} onOpenChange={handleEditDialogChange}>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Edit Assignment</DialogTitle>
                <DialogDescription>
                  Update the assignment status, dates, or notes for this asset.
                </DialogDescription>
              </DialogHeader>
              <AssetAssignmentForm
                form={editAssignmentForm}
                assetOptions={assets}
                employees={employees}
                onSubmit={onSubmitEditAssignment}
                submitLabel="Save changes"
                statusOptions={assignmentStatusOptions}
                showAssetAndEmployeeFields={false}
                selectedAssignment={selectedAssignment}
                submitting={updateAssignment.isPending}
              />
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

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {assets.map(asset => (
          <div key={asset.id} className="border rounded p-4 space-y-2">
            <div className="font-medium">{asset.name}</div>
            <div className="text-sm text-muted-foreground">{asset.type}</div>
            <div className="text-sm flex items-center space-x-1">
              <span>Status:</span>
              {getStatusBadge(asset.status)}
            </div>
            {asset.currentAssignment && (
              <div className="space-y-2 text-sm">
                <div>
                  Assigned to: {asset.currentAssignment.employee?.firstName} {asset.currentAssignment.employee?.lastName}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleEditAssignmentClick(asset.currentAssignment!.id)}
                  >
                    Edit assignment
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleUnassignClick(asset.currentAssignment!.id)}
                  >
                    Unassign
                  </Button>
                </div>
              </div>
            )}
            <div>
              <Button size="sm" variant="outline" onClick={() => window.open(`/asset-file?id=${encodeURIComponent(asset.id)}`, '_blank')}>Print</Button>
              <Button size="sm" variant="outline" className="ml-2" onClick={() => setDocAssetId(asset.id)}>Add Document</Button>
              <Button size="sm" variant="outline" className="ml-2" onClick={() => setRepairsAsset(asset)}>Repairs</Button>
            </div>
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={isUnassignConfirmOpen}
        onOpenChange={handleUnassignDialogChange}
        title="Unassign asset?"
        description={unassignDescription}
        confirmText="Unassign"
        onConfirm={handleConfirmUnassign}
      />

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

type AssetAssignmentFormProps = {
  form: UseFormReturn<InsertAssetAssignment>;
  assetOptions: AssetWithAssignment[];
  employees: Employee[];
  onSubmit: (values: InsertAssetAssignment) => void;
  submitLabel: string;
  statusOptions: string[];
  showAssetAndEmployeeFields?: boolean;
  selectedAssignment?: AssetAssignmentWithDetails | null;
  submitting?: boolean;
};

function AssetAssignmentForm({
  form,
  assetOptions,
  employees,
  onSubmit,
  submitLabel,
  statusOptions,
  showAssetAndEmployeeFields = true,
  selectedAssignment,
  submitting = false,
}: AssetAssignmentFormProps) {
  const assetId = form.watch("assetId");
  const employeeId = form.watch("employeeId");

  const currentAsset =
    assetOptions.find(asset => asset.id === assetId) ??
    (selectedAssignment ? assetOptions.find(asset => asset.id === selectedAssignment.assetId) : undefined) ??
    selectedAssignment?.asset ??
    null;

  const currentEmployee =
    employees.find(emp => emp.id === employeeId) ??
    (selectedAssignment ? employees.find(emp => emp.id === selectedAssignment.employeeId) : undefined) ??
    selectedAssignment?.employee ??
    null;

  const employeeName = currentEmployee
    ? `${currentEmployee.firstName ?? ""} ${currentEmployee.lastName ?? ""}`.trim()
    : selectedAssignment
      ? `${selectedAssignment.employee?.firstName ?? ""} ${selectedAssignment.employee?.lastName ?? ""}`.trim()
      : "";

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        {showAssetAndEmployeeFields ? (
          <>
            <FormField
              control={form.control}
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
                      {assetOptions.map(asset => (
                        <SelectItem key={asset.id} value={asset.id}>
                          {asset.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
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
                      {employees.map(employee => (
                        <SelectItem key={employee.id} value={employee.id}>
                          {employee.firstName} {employee.lastName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1">
              <FormLabel>Asset</FormLabel>
              <div className="text-sm font-medium">
                {currentAsset?.name ?? selectedAssignment?.asset?.name ?? "—"}
              </div>
            </div>
            <div className="space-y-1">
              <FormLabel>Employee</FormLabel>
              <div className="text-sm font-medium">{employeeName || "—"}</div>
            </div>
          </div>
        )}

        <FormField
          control={form.control}
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
          control={form.control}
          name="status"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Status</FormLabel>
              <Select onValueChange={field.onChange} value={field.value || undefined}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {statusOptions.map(status => (
                    <SelectItem key={status} value={status}>
                      {formatStatusLabel(status)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes (Optional)</FormLabel>
              <FormControl>
                <Textarea placeholder="Assignment notes..." {...field} value={field.value ?? ""} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end">
          <Button type="submit" disabled={submitting}>
            {submitLabel}
          </Button>
        </div>
      </form>
    </Form>
  );
}
