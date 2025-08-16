import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";

interface ImportResult {
  success?: number;
  failed?: number;
  error?: { message: string };
}

const systemFields = [
  { value: "employeeCode", label: "Employee Code" },
  { value: "firstName", label: "First Name" },
  { value: "lastName", label: "Last Name" },
  { value: "position", label: "Position" },
  { value: "salary", label: "Salary" },
  { value: "startDate", label: "Start Date" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
];

export default function EmployeeImport() {
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [customFields, setCustomFields] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const { toast } = useToast();

  const detectHeaders = async () => {
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/employees/import", { method: "POST", body: formData });
      const data = await res.json();
      if (res.ok && Array.isArray(data.headers)) {
        setHeaders(data.headers);
        setSelections({});
        setCustomFields({});
      } else {
        toast({ title: "Error", description: "Could not detect headers", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Upload failed", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const downloadTemplate = async () => {
    try {
      const res = await fetch("/api/employees/import/template");
      if (!res.ok) throw new Error("Failed to download");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "employee-import-template.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Error", description: "Failed to download template", variant: "destructive" });
    }
  };

  const handleSelectionChange = (header: string, value: string) => {
    setSelections(prev => ({ ...prev, [header]: value }));
    if (value !== "custom") {
      setCustomFields(prev => ({ ...prev, [header]: "" }));
    }
  };

  const handleCustomChange = (header: string, value: string) => {
    setCustomFields(prev => ({ ...prev, [header]: value }));
  };

  const handleImport = async () => {
    if (!file) return;
    const mapping: Record<string, string> = {};
    for (const header of headers) {
      const selection = selections[header];
      if (selection === "custom") {
        if (customFields[header]) {
          mapping[header] = customFields[header];
        }
      } else if (selection) {
        mapping[header] = selection;
      }
    }
    const formData = new FormData();
    formData.append("file", file);
    formData.append("mapping", JSON.stringify(mapping));
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/employees/import", { method: "POST", body: formData });
      const data = await res.json();
      setResult(data);
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
        toast({
          title: "Import complete",
          description: `${data.success || 0} imported, ${data.failed || 0} failed`,
          variant: data.failed ? "destructive" : "default",
        });
      } else {
        toast({ title: "Error", description: data.error?.message || "Import failed", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Import failed", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-2">
        <Input type="file" accept=".xlsx" onChange={e => setFile(e.target.files?.[0] || null)} />
        <Button onClick={headers.length ? handleImport : detectHeaders} disabled={!file || isSubmitting}>
          {headers.length ? "Import" : "Next"}
        </Button>
        <Button variant="outline" onClick={downloadTemplate}>Download Template</Button>
      </div>

      {headers.length > 0 && (
        <div className="space-y-2">
          {headers.map(h => (
            <div key={h} className="flex items-center space-x-2">
              <span className="w-40 text-sm truncate" title={h}>{h}</span>
              <Select onValueChange={v => handleSelectionChange(h, v)} value={selections[h] || ""}>
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="Select field" />
                </SelectTrigger>
                <SelectContent>
                  {systemFields.map(f => (
                    <SelectItem key={f.value} value={f.value}>
                      {f.label}
                    </SelectItem>
                  ))}
                  <SelectItem value="custom">Custom field</SelectItem>
                </SelectContent>
              </Select>
              {selections[h] === "custom" && (
                <Input
                  placeholder="Custom name"
                  value={customFields[h] || ""}
                  onChange={e => handleCustomChange(h, e.target.value)}
                  className="w-44"
                />
              )}
            </div>
          ))}
        </div>
      )}

      {result && (
        <p className="text-sm text-muted-foreground">
          Imported {result.success || 0}, failed {result.failed || 0}
        </p>
      )}
    </div>
  );
}

