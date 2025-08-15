import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Upload, FileSpreadsheet, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { OrderItem } from "../types/OrderFormData";

interface OrderFileUploadProps {
  onItemsImported: (items: OrderItem[]) => void;
}

interface ParsedItem {
  name: string;
  quantity: number;
  unit?: string;
  notes?: string;
}

interface WorkerResponse {
  type: 'PARSE_SUCCESS' | 'PARSE_ERROR' | 'PARSE_PROGRESS';
  data?: ParsedItem[];
  error?: string;
  progress?: number;
}

export const OrderFileUpload = ({ onItemsImported }: OrderFileUploadProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const workerRef = useRef<Worker | null>(null);

  // Initialize Web Worker
  useEffect(() => {
    const worker = new Worker(new URL('/src/workers/fileProcessingWorker.ts', import.meta.url), {
      type: 'module'
    });
    
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const { type, data, error, progress } = event.data;
      
      switch (type) {
        case 'PARSE_PROGRESS':
          if (progress !== undefined) {
            setProgress(progress);
          }
          break;
          
        case 'PARSE_SUCCESS':
          if (data) {
            // Convert to OrderItem format
            const orderItems: OrderItem[] = data.map(item => ({
              id: crypto.randomUUID(),
              name: item.name,
              quantity: item.quantity,
              unit: item.unit || "",
              notes: item.notes || ""
            }));

            onItemsImported(orderItems);
            toast.success(`Successfully imported ${orderItems.length} items from file`);
          }
          setIsProcessing(false);
          setProgress(0);
          break;
          
        case 'PARSE_ERROR':
          console.error('File parsing error:', error);
          toast.error(error || 'Failed to parse file. Please check the format and try again.');
          setIsProcessing(false);
          setProgress(0);
          break;
      }
    };
    
    worker.onerror = (error) => {
      console.error('Worker error:', error);
      toast.error('An error occurred while processing the file');
      setIsProcessing(false);
      setProgress(0);
    };
    
    workerRef.current = worker;
    
    return () => {
      worker.terminate();
    };
  }, [onItemsImported]);

  const handleFileUpload = async (file: File) => {
    const fileExtension = file.name.split('.').pop()?.toLowerCase();
    
    if (!['xlsx', 'xls', 'csv'].includes(fileExtension || '')) {
      toast.error('Please upload an Excel (.xlsx, .xls) or CSV file');
      return;
    }

    if (!workerRef.current) {
      toast.error('File processor not ready. Please try again.');
      return;
    }

    setIsProcessing(true);
    setProgress(0);
    setUploadedFile(file);

    // Send file to Web Worker for processing
    const fileType = fileExtension === 'csv' ? 'csv' : 'excel';
    workerRef.current.postMessage({
      type: 'PARSE_FILE',
      file,
      fileType
    });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileUpload(files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileUpload(files[0]);
    }
  };

  const clearFile = () => {
    setUploadedFile(null);
    setIsProcessing(false);
    setProgress(0);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSpreadsheet className="w-5 h-5" />
          Import Items from File
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!uploadedFile ? (
          <div
            className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
              isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <Upload className="w-8 h-8 mx-auto mb-4 text-muted-foreground" />
            <p className="text-sm text-muted-foreground mb-4">
              Drag and drop your Excel or CSV file here, or click to browse
            </p>
            <Input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileSelect}
              className="hidden"
              id="file-upload"
              disabled={isProcessing}
            />
            <Button type="button" variant="outline" asChild disabled={isProcessing}>
              <label htmlFor="file-upload" className={isProcessing ? "cursor-not-allowed" : "cursor-pointer"}>
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  'Select File'
                )}
              </label>
            </Button>
            <div className="mt-4 text-xs text-muted-foreground">
              <p className="font-medium mb-1">Expected format:</p>
              <p>Column 1: Item Name (required)</p>
              <p>Column 2: Quantity (required)</p>
              <p>Column 3: Unit (optional)</p>
              <p>Column 4: Notes (optional)</p>
            </div>
          </div>
        ) : isProcessing ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">{uploadedFile.name}</span>
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Processing file...</span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} className="w-full" />
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">{uploadedFile.name}</span>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={clearFile} disabled={isProcessing}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};