import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Upload, FileSpreadsheet, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
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

export const OrderFileUpload = ({ onItemsImported }: OrderFileUploadProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);

  const parseExcelFileAsync = async (file: File): Promise<ParsedItem[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = async (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const worksheet = workbook.Sheets[workbook.SheetNames[0]];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
          
          const items: ParsedItem[] = [];
          const totalRows = jsonData.length - 1; // Exclude header
          
          // Process data in chunks with progress updates
          const processChunk = async (startIndex: number): Promise<void> => {
            const chunkSize = 100;
            const endIndex = Math.min(startIndex + chunkSize, jsonData.length);
            
            for (let i = startIndex; i < endIndex; i++) {
              const row = jsonData[i];
              if (i > 0 && row.length >= 2 && row[0] && row[1]) { // Skip header row
                items.push({
                  name: String(row[0]).trim(),
                  quantity: Number(row[1]) || 1,
                  unit: row[2] ? String(row[2]).trim() : undefined,
                  notes: row[3] ? String(row[3]).trim() : undefined
                });
              }
            }
            
            // Update progress
            const currentProgress = Math.round((endIndex / totalRows) * 100);
            setProgress(currentProgress);
            
            if (endIndex < jsonData.length) {
              // Use setTimeout to allow UI updates
              await new Promise(resolve => setTimeout(resolve, 10));
              await processChunk(endIndex);
            }
          };
          
          await processChunk(1); // Start from row 1 (skip header)
          resolve(items);
        } catch (error) {
          reject(new Error('Failed to parse Excel file'));
        }
      };
      
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsArrayBuffer(file);
    });
  };

  const parseCSVFileAsync = async (file: File): Promise<ParsedItem[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = async (e) => {
        try {
          const text = e.target?.result as string;
          const lines = text.split('\n').filter(line => line.trim());
          
          const items: ParsedItem[] = [];
          const totalLines = lines.length - 1; // Exclude header
          
          // Process lines in chunks with progress updates
          const processChunk = async (startIndex: number): Promise<void> => {
            const chunkSize = 200;
            const endIndex = Math.min(startIndex + chunkSize, lines.length);
            
            for (let i = startIndex; i < endIndex; i++) {
              if (i > 0) { // Skip header row
                const columns = lines[i].split(',').map(col => col.trim().replace(/"/g, ''));
                if (columns.length >= 2 && columns[0] && columns[1]) {
                  items.push({
                    name: columns[0],
                    quantity: Number(columns[1]) || 1,
                    unit: columns[2] || undefined,
                    notes: columns[3] || undefined
                  });
                }
              }
            }
            
            // Update progress
            const currentProgress = Math.round((endIndex / totalLines) * 100);
            setProgress(currentProgress);
            
            if (endIndex < lines.length) {
              // Use setTimeout to allow UI updates
              await new Promise(resolve => setTimeout(resolve, 10));
              await processChunk(endIndex);
            }
          };
          
          await processChunk(1); // Start from line 1 (skip header)
          resolve(items);
        } catch (error) {
          reject(new Error('Failed to parse CSV file'));
        }
      };
      
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  };

  const handleFileUpload = async (file: File) => {
    const fileExtension = file.name.split('.').pop()?.toLowerCase();
    
    if (!['xlsx', 'xls', 'csv'].includes(fileExtension || '')) {
      toast.error('Please upload an Excel (.xlsx, .xls) or CSV file');
      return;
    }

    setIsProcessing(true);
    setProgress(0);
    setUploadedFile(file);
    
    try {
      console.log('Starting file processing...');
      let parsedItems: ParsedItem[];
      
      if (fileExtension === 'csv') {
        parsedItems = await parseCSVFileAsync(file);
      } else {
        parsedItems = await parseExcelFileAsync(file);
      }

      if (parsedItems.length === 0) {
        toast.error('No valid items found in the file. Please check the format.');
        setIsProcessing(false);
        setProgress(0);
        return;
      }

      // Convert to OrderItem format
      const orderItems: OrderItem[] = parsedItems.map(item => ({
        id: crypto.randomUUID(),
        name: item.name,
        quantity: item.quantity,
        unit: item.unit || "",
        notes: item.notes || ""
      }));

      console.log('Successfully processed items:', orderItems.length);
      onItemsImported(orderItems);
      toast.success(`Successfully imported ${orderItems.length} items from file`);
    } catch (error) {
      console.error('File parsing error:', error);
      toast.error('Failed to parse file. Please check the format and try again.');
    } finally {
      setIsProcessing(false);
      setProgress(0);
    }
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