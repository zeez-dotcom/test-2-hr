import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Upload, X, User, FileText } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface ImageUploadProps {
  label: string;
  value?: string;
  onChange: (base64Image: string | undefined) => void;
  accept?: string;
  maxSizeMB?: number;
  preview?: boolean;
  variant?: "profile" | "document";
}


export default function ImageUpload({
  label,
  value,
  onChange,
  accept,
  maxSizeMB = 1,
  preview = true,
  variant = "document"
}: ImageUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isPDF = value?.startsWith("data:application/pdf");
  const inputAccept =
    accept ?? (variant === "document" ? "image/*,application/pdf" : "image/*");

  const handleFileSelect = async (file: File) => {
    setError(null);
    
    // Validate file size
    if (file.size > maxSizeMB * 1024 * 1024) {
      const message = `File size must be less than ${maxSizeMB}MB`;
      setError(message);
      toast({ title: message, variant: "destructive" });
      return;
    }

    // Validate file type
    if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
      setError("Please select a valid image or PDF file");
      return;
    }

    setIsLoading(true);
    
    try {
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64 = e.target?.result as string;
        onChange(base64);
        setIsLoading(false);
      };
      reader.onerror = () => {
        setError("Failed to read file");
        setIsLoading(false);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setError("Failed to process file");
      setIsLoading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const handleRemove = () => {
    onChange(undefined);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      
      {value && preview ? (
        <Card className="relative">
          <CardContent className="p-4">
            <div className="flex items-start space-x-4">
              <div
                className={`flex-shrink-0 ${
                  variant === "profile" ? "w-20 h-20" : "w-16 h-16"
                }`}
              >
                {isPDF ? (
                  <div className="w-full h-full flex items-center justify-center border border-gray-200 rounded-lg bg-gray-50">
                    <FileText className="w-8 h-8 text-gray-400" />
                  </div>
                ) : (
                  <img
                    src={value}
                    alt={label}
                    className={`w-full h-full object-cover border border-gray-200 ${
                      variant === "profile" ? "rounded-full" : "rounded-lg"
                    }`}
                  />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {label}
                </p>
                <p className="text-xs text-gray-500">
                  {isPDF ? "PDF uploaded successfully" : "Image uploaded successfully"}
                </p>
                {isPDF && (
                  <a
                    href={value}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 underline"
                  >
                    View PDF
                  </a>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleRemove}
                className="text-red-600 hover:text-red-700"
              >
                <X size={16} />
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card
          className={`border-2 border-dashed transition-colors cursor-pointer ${
            isDragging 
              ? 'border-primary bg-primary/5' 
              : 'border-gray-300 hover:border-gray-400'
          } ${error ? 'border-red-300 bg-red-50' : ''}`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={handleClick}
        >
          <CardContent className="p-6">
            <div className="text-center">
              <div className="mx-auto w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                {variant === 'profile' ? (
                  <User className="w-6 h-6 text-gray-400" />
                ) : (
                  <FileText className="w-6 h-6 text-gray-400" />
                )}
              </div>
              
              {isLoading ? (
                <p className="text-sm text-gray-600">Processing file...</p>
              ) : (
                <>
                  <div className="flex items-center justify-center space-x-1 mb-2">
                    <Upload className="w-4 h-4 text-gray-400" />
                    <span className="text-sm font-medium text-gray-700">
                      Click to upload or drag and drop
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">
                    {inputAccept.includes("application/pdf")
                      ? `PNG, JPG, GIF, PDF up to ${maxSizeMB}MB`
                      : `PNG, JPG, GIF up to ${maxSizeMB}MB`}
                  </p>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}

      <Input
        ref={fileInputRef}
        type="file"
        accept={inputAccept}
        onChange={handleInputChange}
        className="hidden"
      />
    </div>
  );
}
