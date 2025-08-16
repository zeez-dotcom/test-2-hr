import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";

interface FailedRow {
  rowNumber: number;
  errors: string[];
}

interface ImportResponse {
  failedRows?: FailedRow[];
}

export default function EmployeeImport() {
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [isUploading, setIsUploading] = useState(false);
  const [result, setResult] = useState<ImportResponse | null>(null);
  const { toast } = useToast();

  const handleUpload = () => {
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/employees/import");

    setIsUploading(true);
    setProgress(0);
    setResult(null);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        setProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      setIsUploading(false);
      try {
        const data: ImportResponse = JSON.parse(xhr.responseText);
        setResult(data);
        queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
        if (!data.failedRows || data.failedRows.length === 0) {
          toast({ title: "Import complete", description: "All employees imported successfully." });
        } else {
          toast({ title: "Import finished with errors", description: "Some rows failed validation.", variant: "destructive" });
        }
      } catch {
        toast({ title: "Error", description: "Invalid server response.", variant: "destructive" });
      }
    };

    xhr.onerror = () => {
      setIsUploading(false);
      toast({ title: "Error", description: "Upload failed.", variant: "destructive" });
    };

    xhr.send(formData);
  };

  return (
    <div className="flex flex-col space-y-2 w-full sm:w-auto">
      <div className="flex items-center space-x-2">
        <Input
          type="file"
          accept=".xlsx"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />
        <Button onClick={handleUpload} disabled={!file || isUploading}>
          Upload
        </Button>
      </div>
      {isUploading && <Progress value={progress} className="w-full" />}
      {result && result.failedRows && result.failedRows.length > 0 && (
        <div className="text-sm text-red-600">
          <p>Failed Rows:</p>
          <ul className="list-disc pl-4">
            {result.failedRows.map((row, idx) => (
              <li key={idx}>
                Row {row.rowNumber}: {row.errors.join(", ")}
              </li>
            ))}
          </ul>
        </div>
      )}
      {result && (!result.failedRows || result.failedRows.length === 0) && (
        <p className="text-sm text-green-600">Import successful</p>
      )}
    </div>
  );
}

