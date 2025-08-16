import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

import {
  insertAssetSchema,
  insertAssetAssignmentSchema,
  type AssetWithAssignment,
  type AssetAssignmentWithDetails,
  type InsertAssetAssignment
} from "@shared/schema";

export default function Assets() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const { toast } = useToast();

  const { data: assets = [] } = useQuery<AssetWithAssignment[]>({
    queryKey: ["/api/assets"],
  });

  const { data: assignments = [] } = useQuery<AssetAssignmentWithDetails[]>({
    queryKey: ["/api/asset-assignments"],
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["/api/employees"],
  });

  const createAsset = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/assets", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assets"] });
      setIsCreateOpen(false);
      toast({ title: "Asset created" });
    },
    onError: () => toast({ title: "Failed to create asset", variant: "destructive" }),
  });

  const assignAsset = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/asset-assignments", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/asset-assignments"] });
      setIsAssignOpen(false);
      toast({ title: "Asset assigned" });
    },
    onError: () => toast({ title: "Failed to assign asset", variant: "destructive" }),
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
                <DialogDescription>Select an asset and employee.</DialogDescription>
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
                            {assets.filter(a => a.status === "available").map(a => (
                              <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
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
                            {employees.map((emp: any) => (
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
            <div className="text-sm">Status: {asset.status}</div>
            {asset.currentAssignment && (
              <div className="text-sm">
                Assigned to: {asset.currentAssignment.employee?.firstName} {asset.currentAssignment.employee?.lastName}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

