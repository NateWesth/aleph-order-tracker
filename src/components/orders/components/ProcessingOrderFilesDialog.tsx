
import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Download, Eye, FileText, Upload, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface OrderFile {
  id: string;
  file_name: string;
  file_url: string;
  file_type: 'quote' | 'purchase-order' | 'invoice' | 'delivery-note';
  uploaded_by_role: 'admin' | 'client';
  uploaded_by_user_id: string;
  file_size?: number;
  mime_type?: string;
  created_at: string;
}

interface Order {
  id: string;
  orderNumber: string;
  companyName: string;
  orderDate: Date;
  dueDate: Date;
  items: any[];
  status: string;
}

interface ProcessingOrderFilesDialogProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
  isAdmin: boolean;
}

const fileTypeLabels = {
  'quote': 'Quote',
  'purchase-order': 'Purchase Order',
  'invoice': 'Invoice',
  'delivery-note': 'Delivery Note'
};

export default function ProcessingOrderFilesDialog({
  order,
  isOpen,
  onClose,
  isAdmin
}: ProcessingOrderFilesDialogProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [files, setFiles] = useState<OrderFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState<{ [key: string]: boolean }>({});

  // Fetch files for the order
  const fetchOrderFiles = async () => {
    if (!order?.id || !user?.id) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('order_files')
        .select('*')
        .eq('order_id', order.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Transform the data to match our OrderFile interface
      const transformedFiles: OrderFile[] = (data || []).map(file => ({
        id: file.id,
        file_name: file.file_name,
        file_url: file.file_url,
        file_type: file.file_type as 'quote' | 'purchase-order' | 'invoice' | 'delivery-note',
        uploaded_by_role: file.uploaded_by_role as 'admin' | 'client',
        uploaded_by_user_id: file.uploaded_by_user_id,
        file_size: file.file_size || undefined,
        mime_type: file.mime_type || undefined,
        created_at: file.created_at
      }));
      
      setFiles(transformedFiles);
    } catch (error) {
      console.error('Error fetching order files:', error);
      toast({
        title: "Error",
        description: "Failed to load files. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Upload file function
  const handleFileUpload = async (file: File, fileType: 'quote' | 'purchase-order' | 'invoice' | 'delivery-note') => {
    if (!order?.id || !user?.id) return;

    setUploadingFiles(prev => ({ ...prev, [fileType]: true }));

    try {
      // Upload file to Supabase Storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${order.id}/${fileType}/${Date.now()}.${fileExt}`;
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('order-files')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('order-files')
        .getPublicUrl(fileName);

      // Save file record to database
      const { error: dbError } = await supabase
        .from('order_files')
        .insert({
          order_id: order.id,
          file_name: file.name,
          file_url: urlData.publicUrl,
          file_type: fileType,
          uploaded_by_role: isAdmin ? 'admin' : 'client',
          uploaded_by_user_id: user.id,
          file_size: file.size,
          mime_type: file.type
        });

      if (dbError) throw dbError;

      toast({
        title: "File Uploaded",
        description: `${file.name} has been uploaded successfully.`,
      });

      // Refresh files list
      fetchOrderFiles();
    } catch (error) {
      console.error('Error uploading file:', error);
      toast({
        title: "Upload Failed",
        description: "Failed to upload file. Please try again.",
        variant: "destructive",
      });
    } finally {
      setUploadingFiles(prev => ({ ...prev, [fileType]: false }));
    }
  };

  // Download file
  const handleFileDownload = (file: OrderFile) => {
    const link = document.createElement('a');
    link.href = file.file_url;
    link.download = file.file_name;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFileView = (file: OrderFile) => {
    window.open(file.file_url, '_blank');
  };

  const handleFilePrint = (file: OrderFile) => {
    const printWindow = window.open(file.file_url, '_blank');
    if (printWindow) {
      printWindow.onload = () => {
        printWindow.print();
      };
    }
  };

  // Get files by type
  const getFilesByType = (type: string) => {
    return files.filter(file => file.file_type === type);
  };

  // Check if user can upload specific file type
  const canUploadFileType = (fileType: 'quote' | 'purchase-order' | 'invoice' | 'delivery-note') => {
    if (isAdmin) {
      return ['quote', 'invoice', 'delivery-note'].includes(fileType);
    } else {
      return fileType === 'purchase-order';
    }
  };

  // File upload component
  const FileUploadSection = ({ fileType }: { fileType: 'quote' | 'purchase-order' | 'invoice' | 'delivery-note' }) => {
    const inputId = `file-upload-${fileType}`;
    
    if (!canUploadFileType(fileType)) return null;

    return (
      <div className="border-t pt-4 mt-4">
        <Label htmlFor={inputId} className="text-sm font-medium">
          Upload {fileTypeLabels[fileType]}
        </Label>
        <div className="flex items-center gap-2 mt-2">
          <Input
            id={inputId}
            type="file"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                handleFileUpload(file, fileType);
                e.target.value = ''; // Reset input
              }
            }}
            disabled={uploadingFiles[fileType]}
            className="flex-1"
          />
          <Button
            variant="outline"
            size="sm"
            disabled={uploadingFiles[fileType]}
            onClick={() => document.getElementById(inputId)?.click()}
          >
            {uploadingFiles[fileType] ? (
              <>
                <Upload className="h-4 w-4 mr-1 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 mr-1" />
                Upload
              </>
            )}
          </Button>
        </div>
      </div>
    );
  };

  useEffect(() => {
    if (isOpen && order) {
      fetchOrderFiles();
    }
  }, [isOpen, order?.id]);

  // Real-time subscription for file changes
  useEffect(() => {
    if (!order?.id) return;

    const channel = supabase
      .channel(`order-files-${order.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'order_files',
          filter: `order_id=eq.${order.id}`
        },
        () => {
          fetchOrderFiles();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [order?.id]);

  if (!order) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Files for Order #{order.orderNumber}</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="quote" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="quote">Quote</TabsTrigger>
            <TabsTrigger value="purchase-order">Purchase Order</TabsTrigger>
            <TabsTrigger value="invoice">Invoice</TabsTrigger>
            <TabsTrigger value="delivery-note">Delivery Notes</TabsTrigger>
          </TabsList>

          {/* Quote Tab */}
          <TabsContent value="quote" className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-medium">Quote Files</h3>
              {isAdmin && (
                <Badge variant="secondary">Admin can upload</Badge>
              )}
            </div>

            <div className="space-y-2">
              {getFilesByType('quote').map((file) => (
                <div key={file.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center space-x-3">
                    <FileText className="h-5 w-5 text-blue-500" />
                    <div>
                      <p className="font-medium">{file.file_name}</p>
                      <p className="text-sm text-gray-500">
                        Uploaded by {file.uploaded_by_role} • {new Date(file.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Button variant="ghost" size="sm" onClick={() => handleFileView(file)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleFileDownload(file)}>
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleFilePrint(file)}>
                      Print
                    </Button>
                  </div>
                </div>
              ))}
              {getFilesByType('quote').length === 0 && (
                <p className="text-center text-gray-500 py-8">No quote files uploaded yet.</p>
              )}
            </div>

            <FileUploadSection fileType="quote" />
          </TabsContent>

          {/* Purchase Order Tab */}
          <TabsContent value="purchase-order" className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-medium">Purchase Order Files</h3>
              {!isAdmin && (
                <Badge variant="secondary">Client can upload</Badge>
              )}
            </div>

            <div className="space-y-2">
              {getFilesByType('purchase-order').map((file) => (
                <div key={file.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center space-x-3">
                    <FileText className="h-5 w-5 text-green-500" />
                    <div>
                      <p className="font-medium">{file.file_name}</p>
                      <p className="text-sm text-gray-500">
                        Uploaded by {file.uploaded_by_role} • {new Date(file.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Button variant="ghost" size="sm" onClick={() => handleFileView(file)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleFileDownload(file)}>
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleFilePrint(file)}>
                      Print
                    </Button>
                  </div>
                </div>
              ))}
              {getFilesByType('purchase-order').length === 0 && (
                <p className="text-center text-gray-500 py-8">No purchase order files uploaded yet.</p>
              )}
            </div>

            <FileUploadSection fileType="purchase-order" />
          </TabsContent>

          {/* Invoice Tab */}
          <TabsContent value="invoice" className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-medium">Invoice Files</h3>
              {isAdmin && (
                <Badge variant="secondary">Admin can upload</Badge>
              )}
            </div>

            <div className="space-y-2">
              {getFilesByType('invoice').map((file) => (
                <div key={file.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center space-x-3">
                    <FileText className="h-5 w-5 text-purple-500" />
                    <div>
                      <p className="font-medium">{file.file_name}</p>
                      <p className="text-sm text-gray-500">
                        Uploaded by {file.uploaded_by_role} • {new Date(file.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Button variant="ghost" size="sm" onClick={() => handleFileView(file)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleFileDownload(file)}>
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleFilePrint(file)}>
                      Print
                    </Button>
                  </div>
                </div>
              ))}
              {getFilesByType('invoice').length === 0 && (
                <p className="text-center text-gray-500 py-8">No invoice files uploaded yet.</p>
              )}
            </div>

            <FileUploadSection fileType="invoice" />
          </TabsContent>

          {/* Delivery Notes Tab */}
          <TabsContent value="delivery-note" className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-medium">Delivery Note Files</h3>
              {isAdmin && (
                <Badge variant="secondary">Admin can upload</Badge>
              )}
            </div>

            <div className="space-y-2">
              {getFilesByType('delivery-note').map((file) => (
                <div key={file.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center space-x-3">
                    <FileText className="h-5 w-5 text-orange-500" />
                    <div>
                      <p className="font-medium">{file.file_name}</p>
                      <p className="text-sm text-gray-500">
                        Uploaded by {file.uploaded_by_role} • {new Date(file.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Button variant="ghost" size="sm" onClick={() => handleFileView(file)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleFileDownload(file)}>
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleFilePrint(file)}>
                      Print
                    </Button>
                  </div>
                </div>
              ))}
              {getFilesByType('delivery-note').length === 0 && (
                <p className="text-center text-gray-500 py-8">No delivery note files uploaded yet.</p>
              )}
            </div>

            <FileUploadSection fileType="delivery-note" />
          </TabsContent>
        </tabs>
      </DialogContent>
    </Dialog>
  );
}
