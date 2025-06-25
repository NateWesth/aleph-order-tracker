
import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, Download, Eye, Trash2, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface OrderFile {
  id: string;
  file_name: string;
  file_url: string;
  file_type: 'quote' | 'purchase-order' | 'invoice';
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
  'invoice': 'Invoice'
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
  const [uploading, setUploading] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
      setFiles(data || []);
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

  // Upload file to Supabase storage and database
  const handleFileUpload = async (file: File, fileType: string) => {
    if (!order?.id || !user?.id) return;

    setUploading(fileType);
    try {
      // Upload to Supabase storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${order.id}/${fileType}_${Date.now()}.${fileExt}`;
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('order-files')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('order-files')
        .getPublicUrl(fileName);

      // Save to database
      const { error: dbError } = await supabase
        .from('order_files')
        .insert({
          order_id: order.id,
          file_name: file.name,
          file_url: publicUrl,
          file_type: fileType,
          uploaded_by_role: isAdmin ? 'admin' : 'client',
          uploaded_by_user_id: user.id,
          file_size: file.size,
          mime_type: file.type
        });

      if (dbError) throw dbError;

      toast({
        title: "File Uploaded",
        description: `${fileTypeLabels[fileType as keyof typeof fileTypeLabels]} has been uploaded successfully.`,
      });

      fetchOrderFiles(); // Refresh files list
    } catch (error) {
      console.error('Error uploading file:', error);
      toast({
        title: "Upload Failed",
        description: "Failed to upload file. Please try again.",
        variant: "destructive",
      });
    } finally {
      setUploading(null);
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

  // View file (open in new tab)
  const handleFileView = (file: OrderFile) => {
    window.open(file.file_url, '_blank');
  };

  // Print file
  const handleFilePrint = (file: OrderFile) => {
    const printWindow = window.open(file.file_url, '_blank');
    if (printWindow) {
      printWindow.onload = () => {
        printWindow.print();
      };
    }
  };

  // Delete file
  const handleFileDelete = async (file: OrderFile) => {
    if (!user?.id || file.uploaded_by_user_id !== user.id) return;

    try {
      // Delete from storage
      const fileName = file.file_url.split('/').pop();
      if (fileName) {
        await supabase.storage
          .from('order-files')
          .remove([`${order?.id}/${fileName}`]);
      }

      // Delete from database
      const { error } = await supabase
        .from('order_files')
        .delete()
        .eq('id', file.id);

      if (error) throw error;

      toast({
        title: "File Deleted",
        description: "File has been deleted successfully.",
      });

      fetchOrderFiles(); // Refresh files list
    } catch (error) {
      console.error('Error deleting file:', error);
      toast({
        title: "Delete Failed",
        description: "Failed to delete file. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Get files by type
  const getFilesByType = (type: string) => {
    return files.filter(file => file.file_type === type);
  };

  // Check if user can upload this file type
  const canUpload = (fileType: string) => {
    if (isAdmin) {
      return fileType === 'quote' || fileType === 'invoice';
    } else {
      return fileType === 'purchase-order';
    }
  };

  // Check if user can delete this file
  const canDelete = (file: OrderFile) => {
    return file.uploaded_by_user_id === user?.id;
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
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="quote">Quote</TabsTrigger>
            <TabsTrigger value="purchase-order">Purchase Order</TabsTrigger>
            <TabsTrigger value="invoice">Invoice</TabsTrigger>
          </TabsList>

          {/* Quote Tab */}
          <TabsContent value="quote" className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-medium">Quote Files</h3>
              {canUpload('quote') && (
                <div>
                  <Input
                    type="file"
                    id="quote-upload"
                    className="hidden"
                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileUpload(file, 'quote');
                    }}
                  />
                  <Button
                    onClick={() => document.getElementById('quote-upload')?.click()}
                    disabled={uploading === 'quote'}
                    size="sm"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    {uploading === 'quote' ? 'Uploading...' : 'Upload Quote'}
                  </Button>
                </div>
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
                    {canDelete(file) && (
                      <Button variant="ghost" size="sm" onClick={() => handleFileDelete(file)}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
              {getFilesByType('quote').length === 0 && (
                <p className="text-center text-gray-500 py-8">No quote files uploaded yet.</p>
              )}
            </div>
          </TabsContent>

          {/* Purchase Order Tab */}
          <TabsContent value="purchase-order" className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-medium">Purchase Order Files</h3>
              {canUpload('purchase-order') && (
                <div>
                  <Input
                    type="file"
                    id="po-upload"
                    className="hidden"
                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileUpload(file, 'purchase-order');
                    }}
                  />
                  <Button
                    onClick={() => document.getElementById('po-upload')?.click()}
                    disabled={uploading === 'purchase-order'}
                    size="sm"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    {uploading === 'purchase-order' ? 'Uploading...' : 'Upload Purchase Order'}
                  </Button>
                </div>
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
                    {canDelete(file) && (
                      <Button variant="ghost" size="sm" onClick={() => handleFileDelete(file)}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
              {getFilesByType('purchase-order').length === 0 && (
                <p className="text-center text-gray-500 py-8">No purchase order files uploaded yet.</p>
              )}
            </div>
          </TabsContent>

          {/* Invoice Tab */}
          <TabsContent value="invoice" className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-medium">Invoice Files</h3>
              {canUpload('invoice') && (
                <div>
                  <Input
                    type="file"
                    id="invoice-upload"
                    className="hidden"
                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileUpload(file, 'invoice');
                    }}
                  />
                  <Button
                    onClick={() => document.getElementById('invoice-upload')?.click()}
                    disabled={uploading === 'invoice'}
                    size="sm"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    {uploading === 'invoice' ? 'Uploading...' : 'Upload Invoice'}
                  </Button>
                </div>
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
                    {canDelete(file) && (
                      <Button variant="ghost" size="sm" onClick={() => handleFileDelete(file)}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
              {getFilesByType('invoice').length === 0 && (
                <p className="text-center text-gray-500 py-8">No invoice files uploaded yet.</p>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
