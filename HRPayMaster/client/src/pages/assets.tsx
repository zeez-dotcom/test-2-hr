import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { apiPost } from "@/lib/http";
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

  const onSubmitAsset = (data: any) => createAsset.mutate(data);
  const onSubmitAssignment = (data: any) => assignAsset.mutate(data);

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
              <div className="text-sm">
                Assigned to: {asset.currentAssignment.employee?.firstName} {asset.currentAssignment.employee?.lastName}
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
