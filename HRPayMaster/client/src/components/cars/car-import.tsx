import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { apiUpload, apiGet } from "@/lib/http";
import { toastApiError } from "@/lib/toastError";

interface ImportResult {
  success?: number;
  failed?: number;
  error?: { message: string };
}

const systemFields = [
  { value: "plateNumber", label: "Plate Number" },
  { value: "make", label: "Make" },
  { value: "model", label: "Model" },
  { value: "year", label: "Year" },
  { value: "color", label: "Color" },
  { value: "vin", label: "VIN" },
  { value: "fuelType", label: "Fuel Type" },
  { value: "mileage", label: "Mileage" },
  { value: "status", label: "Status" },
  { value: "purchaseDate", label: "Purchase Date" },
  { value: "purchasePrice", label: "Purchase Price" },
  { value: "insuranceExpiry", label: "Insurance Expiry" },
  { value: "registrationExpiry", label: "Registration Expiry" },
];

export default function CarImport() {
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
      const res = await apiUpload("/api/cars/import", formData);
      if (!res.ok) {
        if (res.status === 415) {
          toast({ title: "Unsupported file type", variant: "destructive" });
        } else if (res.status === 413) {
          toastApiError(res, "File too large");
        } else {
          toastApiError(res, "Upload failed");
        }
        return;
      }
      const data = res.data;
      if (Array.isArray(data.headers)) {
        setHeaders(data.headers);
        setSelections({});
        setCustomFields({});
      } else {
        toastApiError({ ok: false, status: res.status, error: { message: "Could not detect headers" } }, "Could not detect headers");
      }
    } catch (err) {
      toastApiError(err, "Upload failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  const downloadTemplate = async () => {
    try {
      const res = await apiGet("/api/cars/import/template");
      if (!res.ok) {
        toastApiError(res, "Failed to download template");
        return;
      }
      const blob = res.data as Blob;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "car-import-template.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      toastApiError(err, "Failed to download template");
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
      const res = await apiUpload("/api/cars/import", formData);
      const data = res.data;
      setResult(data);
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ["/api/cars"] });
        toast({
          title: "Import complete",
          description: `${data.success || 0} imported, ${data.failed || 0} failed`,
          variant: data.failed ? "destructive" : "default",
        });
      } else {
        if (res.status === 415) {
          toast({ title: "Unsupported file type", variant: "destructive" });
        } else if (res.status === 413) {
          toastApiError(res, "File too large");
        } else {
          // Prefer server error message as description with a generic 'Error' title
          const serverMessage =
            (res?.error && typeof res.error === "object" && (res.error as any)?.message)
              ? (res.error as any).message
              : (typeof (res as any)?.error?.error?.message === "string"
                  ? (res as any).error.error.message
                  : undefined);
          if (serverMessage) {
            toast({ title: "Error", description: serverMessage, variant: "destructive" });
          } else {
            toast({ title: "Error", description: "Upload failed", variant: "destructive" });
          }
        }
      }
    } catch (err) {
      // In case of thrown errors, show a generic 'Error' title and fallback description
      const message = (err as any)?.message ?? undefined;
      if (message) {
        toast({ title: "Error", description: message, variant: "destructive" });
      } else {
        toast({ title: "Error", description: "Upload failed", variant: "destructive" });
      }
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
                    <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
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

