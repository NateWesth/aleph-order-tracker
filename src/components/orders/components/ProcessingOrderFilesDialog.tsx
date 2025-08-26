import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Download, Eye, FileText, Upload, Plus, Trash2, Printer } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";


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
  const [deletingFiles, setDeletingFiles] = useState<{ [key: string]: boolean }>({});

  const fetchOrderFiles = async () => {
    if (!order?.id || !user?.id) return;
    setLoading(true);
    try {
      console.log('Fetching files for order:', order.id);
      const { data, error } = await supabase
        .from('order_files')
        .select('*')
        .eq('order_id', order.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching order files:', error);
        throw error;
      }

      console.log('Files fetched successfully:', data?.length || 0);
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

  const handleFileUpload = async (file: File, fileType: 'quote' | 'purchase-order' | 'invoice' | 'delivery-note') => {
    if (!order?.id || !user?.id) {
      console.error('Missing order ID or user ID');
      return;
    }

    console.log('Starting file upload:', {
      fileName: file.name,
      fileType,
      orderId: order.id,
      userId: user.id,
      isAdmin
    });

    setUploadingFiles(prev => ({ ...prev, [fileType]: true }));

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${order.id}/${fileType}/${Date.now()}.${fileExt}`;

      console.log('Uploading to storage:', fileName);
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('order-files')
        .upload(fileName, file);

      if (uploadError) {
        console.error('Storage upload error:', uploadError);
        throw uploadError;
      }

      console.log('File uploaded to storage successfully:', uploadData);
      const { data: urlData } = supabase.storage
        .from('order-files')
        .getPublicUrl(fileName);

      console.log('Public URL generated:', urlData.publicUrl);

      const fileRecord = {
        order_id: order.id,
        file_name: file.name,
        file_url: urlData.publicUrl,
        file_type: fileType,
        uploaded_by_role: isAdmin ? 'admin' : 'client',
        uploaded_by_user_id: user.id,
        file_size: file.size,
        mime_type: file.type
      };

      console.log('Inserting file record:', fileRecord);
      const { error: dbError } = await supabase
        .from('order_files')
        .insert(fileRecord);

      if (dbError) {
        console.error('Database insert error:', dbError);
        throw dbError;
      }

      console.log('File record inserted successfully');
      toast({
        title: "File Uploaded",
        description: `${file.name} has been uploaded successfully.`
      });

      fetchOrderFiles();
    } catch (error: any) {
      console.error('Error uploading file:', error);
      let errorMessage = "Failed to upload file. Please try again.";
      if (error?.message) {
        errorMessage = `Upload failed: ${error.message}`;
      }
      toast({
        title: "Upload Failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setUploadingFiles(prev => ({ ...prev, [fileType]: false }));
    }
  };

  const handleFileDelete = async (file: OrderFile) => {
    if (!user?.id) {
      console.error('Missing user ID');
      return;
    }
    
    const canDelete = isAdmin || file.uploaded_by_user_id === user.id;
    if (!canDelete) {
      toast({
        title: "Permission Denied",
        description: "You don't have permission to delete this file.",
        variant: "destructive"
      });
      return;
    }

    console.log('Starting file deletion:', {
      fileName: file.file_name,
      fileId: file.id,
      userId: user.id,
      isAdmin
    });

    setDeletingFiles(prev => ({ ...prev, [file.id]: true }));

    try {
      const urlParts = file.file_url.split('/');
      const fileName = urlParts[urlParts.length - 1];
      const fileType = file.file_type;
      const orderId = order?.id;
      const filePath = `${orderId}/${fileType}/${fileName}`;

      console.log('Deleting from storage:', filePath);
      const { error: storageError } = await supabase.storage
        .from('order-files')
        .remove([filePath]);

      if (storageError) {
        console.error('Storage deletion error:', storageError);
      }

      console.log('File deleted from storage, now deleting database record');
      const { error: dbError } = await supabase
        .from('order_files')
        .delete()
        .eq('id', file.id);

      if (dbError) {
        console.error('Database deletion error:', dbError);
        throw dbError;
      }

      console.log('File record deleted from database successfully');
      toast({
        title: "File Deleted",
        description: `${file.file_name} has been deleted successfully.`
      });

      fetchOrderFiles();
    } catch (error: any) {
      console.error('Error deleting file:', error);
      let errorMessage = "Failed to delete file. Please try again.";
      if (error?.message) {
        errorMessage = `Deletion failed: ${error.message}`;
      }
      toast({
        title: "Deletion Failed",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setDeletingFiles(prev => ({ ...prev, [file.id]: false }));
    }
  };

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

  const getFilesByType = (type: string) => {
    return files.filter(file => file.file_type === type);
  };

  const canUploadFileType = useCallback((fileType: 'quote' | 'purchase-order' | 'invoice' | 'delivery-note') => {
    // Disable uploads for completed orders for non-admin users
    if (order?.status === 'completed' && !isAdmin) {
      return false;
    }
    
    return true;
  }, [order?.status, isAdmin]);

  const canDeleteFile = (file: OrderFile) => {
    return isAdmin || file.uploaded_by_user_id === user?.id;
  };

  const getUploadGuidanceText = (fileType: 'quote' | 'purchase-order' | 'invoice' | 'delivery-note') => {
    if (isAdmin) {
      return fileType === 'purchase-order' ? 'Typically uploaded by clients' : 'Admin can upload';
    } else {
      return fileType === 'purchase-order' ? 'Client can upload' : 'Typically uploaded by admin';
    }
  };


  const FileUploadSection = ({ fileType }: { fileType: 'quote' | 'purchase-order' | 'invoice' | 'delivery-note' }) => {
    const inputId = `file-upload-${fileType}`;
    
    if (!canUploadFileType(fileType)) {
      console.log('Upload not allowed for file type:', fileType);
      return null;
    }
    
    return (
      <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <Label htmlFor={inputId} className="text-sm font-medium text-gray-700">
              Upload {fileTypeLabels[fileType]}
            </Label>
            <div className="mt-1">
                <Input
                  id={inputId}
                  type="file"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.png,.jpg,.jpeg,.gif,.zip,.rar"
                  onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    handleFileUpload(file, fileType);
                    e.target.value = '';
                  }
                }}
                disabled={uploadingFiles[fileType]}
                className="w-full"
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Supported formats: PDF, DOC, DOCX, XLS, XLSX, CSV, PNG, JPG, JPEG, GIF, ZIP, RAR (Max 10MB)
            </p>
          </div>
        </div>
        
        {uploadingFiles[fileType] && (
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Upload className="h-4 w-4 animate-spin" />
            Uploading...
          </div>
        )}
      </div>
    );
  };

  const FileRow = ({ file }: { file: OrderFile }) => (
    <div key={file.id} className="flex items-center justify-between p-3 border rounded-lg">
      <div className="flex items-center space-x-3">
        <FileText className={`h-5 w-5 ${
          file.file_type === 'quote' ? 'text-blue-500' : 
          file.file_type === 'purchase-order' ? 'text-green-500' : 
          file.file_type === 'invoice' ? 'text-purple-500' : 
          'text-orange-500'
        }`} />
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
          <Printer className="h-4 w-4" />
        </Button>
        {canDeleteFile(file) && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button 
                variant="ghost" 
                size="sm" 
                className="text-red-600 hover:text-red-700" 
                disabled={deletingFiles[file.id]}
              >
                {deletingFiles[file.id] ? (
                  <Upload className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete File</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete "{file.file_name}"? This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction 
                  onClick={() => handleFileDelete(file)} 
                  className="bg-red-600 hover:bg-red-700"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </div>
  );

  useEffect(() => {
    if (isOpen && order) {
      console.log('Dialog opened for order:', order.id);
      fetchOrderFiles();
    }
  }, [isOpen, order?.id]);

  useEffect(() => {
    if (!order?.id) return;
    
    console.log('Setting up real-time subscription for order files:', order.id);
    const channel = supabase
      .channel(`order-files-${order.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'order_files',
        filter: `order_id=eq.${order.id}`
      }, (payload) => {
        console.log('Real-time file change detected:', payload);
        fetchOrderFiles();
      })
      .subscribe();

    return () => {
      console.log('Cleaning up real-time subscription for order files');
      supabase.removeChannel(channel);
    };
  }, [order?.id]);

  if (!order) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Files for Order #{order.orderNumber}</DialogTitle>
          <DialogDescription>
            Manage and upload files for this order using the file upload inputs below.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="quote" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="quote">Quote</TabsTrigger>
            <TabsTrigger value="purchase-order">Purchase Order</TabsTrigger>
            <TabsTrigger value="invoice">Invoice</TabsTrigger>
            <TabsTrigger value="delivery-note">Delivery Notes</TabsTrigger>
          </TabsList>

          <TabsContent value="quote" className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-medium">Quote Files</h3>
              <Badge variant="secondary">{getUploadGuidanceText('quote')}</Badge>
            </div>

            <div className="space-y-2">
              {getFilesByType('quote').map(file => (
                <FileRow key={file.id} file={file} />
              ))}
              {getFilesByType('quote').length === 0 && (
                <p className="text-center text-gray-500 py-8">No quote files uploaded yet.</p>
              )}
            </div>

            <FileUploadSection fileType="quote" />
          </TabsContent>

          <TabsContent value="purchase-order" className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-medium">Purchase Order Files</h3>
              <Badge variant="secondary">{getUploadGuidanceText('purchase-order')}</Badge>
            </div>

            <div className="space-y-2">
              {getFilesByType('purchase-order').map(file => (
                <FileRow key={file.id} file={file} />
              ))}
              {getFilesByType('purchase-order').length === 0 && (
                <p className="text-center text-gray-500 py-8">No purchase order files uploaded yet.</p>
              )}
            </div>

            <FileUploadSection fileType="purchase-order" />
          </TabsContent>

          <TabsContent value="invoice" className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-medium">Invoice Files</h3>
              <Badge variant="secondary">{getUploadGuidanceText('invoice')}</Badge>
            </div>

            <div className="space-y-2">
              {getFilesByType('invoice').map(file => (
                <FileRow key={file.id} file={file} />
              ))}
              {getFilesByType('invoice').length === 0 && (
                <p className="text-center text-gray-500 py-8">No invoice files uploaded yet.</p>
              )}
            </div>

            <FileUploadSection fileType="invoice" />
          </TabsContent>

          <TabsContent value="delivery-note" className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-medium">Delivery Note Files</h3>
              <Badge variant="secondary">{getUploadGuidanceText('delivery-note')}</Badge>
            </div>

            <div className="space-y-2">
              {getFilesByType('delivery-note').map(file => (
                <FileRow key={file.id} file={file} />
              ))}
              {getFilesByType('delivery-note').length === 0 && (
                <p className="text-center text-gray-500 py-8">No delivery note files uploaded yet.</p>
              )}
            </div>

            <FileUploadSection fileType="delivery-note" />
          </TabsContent>
        </Tabs>

      </DialogContent>
    </Dialog>
  );
}
