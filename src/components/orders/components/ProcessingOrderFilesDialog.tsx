import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Download, Eye, FileText, Upload, Plus, Trash2, Scan, Printer, Camera, ImageIcon, Search, Wifi } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { NativeScanningService } from "@/services/nativeScanningService";
import { Capacitor } from '@capacitor/core';

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
  const [scanningFiles, setScanningFiles] = useState<{ [key: string]: boolean }>({});
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [currentScanType, setCurrentScanType] = useState<'quote' | 'purchase-order' | 'invoice' | 'delivery-note' | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isNativeDevice, setIsNativeDevice] = useState(false);
  const [printers, setPrinters] = useState<any[]>([]);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [autoDiscoveryRunning, setAutoDiscoveryRunning] = useState(false);
  const [manualIPInput, setManualIPInput] = useState('');
  const [showManualIP, setShowManualIP] = useState(false);
  const scanningService = NativeScanningService.getInstance();

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

  // Auto-discovery of network printers
  const autoDiscoverPrinters = async () => {
    try {
      setAutoDiscoveryRunning(true);
      console.log('Starting automatic printer discovery...');
      
      const discoveredPrinters = await scanningService.discoverPrinters();
      
      // Filter out devices that are already in the list
      const newPrinters = discoveredPrinters.filter(newPrinter => 
        !printers.some(existingPrinter => existingPrinter.id === newPrinter.id)
      );
      
      if (newPrinters.length > 0) {
        setPrinters(prev => [...prev, ...newPrinters]);
        console.log(`Auto-discovered ${newPrinters.length} new device(s):`, newPrinters);
        
        // Show subtle notification for auto-discovered devices
        const networkPrinters = newPrinters.filter(p => p.type === 'network');
        if (networkPrinters.length > 0) {
          toast({
            title: `Found ${networkPrinters.length} network printer(s)`,
            description: "Automatically added to your device list.",
          });
        }
      }
      
      console.log('Auto-discovery completed. Total devices:', discoveredPrinters.length);
    } catch (error) {
      console.error('Auto printer discovery error:', error);
      // Don't show error toast for automatic discovery to avoid spam
    } finally {
      setAutoDiscoveryRunning(false);
    }
  };

  // Manual discovery with user feedback
  const discoverPrinters = async () => {
    try {
      setIsDiscovering(true);
      console.log('Starting manual printer discovery...');
      
      const discoveredPrinters = await scanningService.discoverPrinters();
      
      // Replace the entire list with fresh discovery
      setPrinters(discoveredPrinters);
      console.log('Manual discovery completed. Devices found:', discoveredPrinters);
      
      if (discoveredPrinters.length === 0) {
        // Check capabilities to give better error message
        const capabilities = await scanningService.getDeviceAccessCapabilities();
        
        let message = "No devices found. ";
        if (!capabilities.usb && !capabilities.bluetooth) {
          message += "Your browser doesn't support direct device access. Use Chrome for better device support.";
        } else {
          message += "Try adding a network printer manually or check device connections.";
        }
        
        toast({
          title: "No devices discovered",
          description: message,
        });
      } else {
        const deviceTypes = {
          usb: discoveredPrinters.filter(p => p.type === 'usb').length,
          bluetooth: discoveredPrinters.filter(p => p.type === 'bluetooth').length,
          network: discoveredPrinters.filter(p => p.type === 'network').length
        };
        
        const typesSummary = Object.entries(deviceTypes)
          .filter(([_, count]) => count > 0)
          .map(([type, count]) => `${count} ${type}`)
          .join(', ');
        
        toast({
          title: "Devices found!",
          description: `Found ${discoveredPrinters.length} device(s): ${typesSummary}`,
        });
      }
    } catch (error) {
      console.error('Manual printer discovery error:', error);
      toast({
        title: "Device Access Error",
        description: "Unable to access devices. Please try using Chrome browser or grant device permissions.",
        variant: "destructive",
      });
    } finally {
      setIsDiscovering(false);
    }
  };

  // Add network printer manually
  const addNetworkPrinter = async () => {
    if (!manualIPInput.trim()) {
      toast({
        title: "IP Address Required",
        description: "Please enter a valid IP address.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsDiscovering(true);
      const printer = await scanningService.addNetworkPrinter(manualIPInput.trim());
      
      if (printer) {
        setPrinters(prev => [...prev, printer]);
        setManualIPInput('');
        setShowManualIP(false);
        toast({
          title: "Printer Added",
          description: `Network printer at ${printer.ip} has been added.`,
        });
      } else {
        toast({
          title: "Printer Not Found",
          description: `No printer found at ${manualIPInput}. Check the IP address and ensure the printer is online.`,
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error adding network printer:', error);
      toast({
        title: "Connection Error",
        description: "Unable to connect to the printer. Please verify the IP address.",
        variant: "destructive",
      });
    } finally {
      setIsDiscovering(false);
    }
  };

  const handlePrinterScan = async (printer: any, fileType: 'quote' | 'purchase-order' | 'invoice' | 'delivery-note') => {
    try {
      setScanningFiles(prev => ({ ...prev, [fileType]: true }));
      const result = await scanningService.scanFromPrinter(printer);
      
      if (result.success && result.base64Data) {
        const file = scanningService.base64ToFile(result.base64Data, result.fileName || 'scan.jpg');
        await handleFileUpload(file, fileType);
        toast({
          title: "Document scanned successfully",
          description: `Document scanned from ${printer.name}`,
        });
      } else {
        toast({
          title: "Scan failed",
          description: result.error || "Failed to scan from printer",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Printer scan error:', error);
      toast({
        title: "Scan error",
        description: "An error occurred while scanning from printer",
        variant: "destructive",
      });
    } finally {
      setScanningFiles(prev => ({ ...prev, [fileType]: false }));
    }
  };

  // Native scanning functions
  const handleNativeScan = async (fileType: 'quote' | 'purchase-order' | 'invoice' | 'delivery-note') => {
    try {
      setScanningFiles(prev => ({ ...prev, [fileType]: true }));
      
      const result = await scanningService.scanDocument();
      
      if (result.success && result.base64Data) {
        const file = scanningService.base64ToFile(result.base64Data, result.fileName!);
        await handleFileUpload(file, fileType);
        
        toast({
          title: "Document Scanned!",
          description: `${fileTypeLabels[fileType]} has been scanned successfully.`
        });
      } else {
        toast({
          title: "Scan Failed",
          description: result.error || "Failed to scan document",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error scanning document:', error);
      toast({
        title: "Scanner Error",
        description: "Unable to access camera. Please try manual upload.",
        variant: "destructive",
      });
    } finally {
      setScanningFiles(prev => ({ ...prev, [fileType]: false }));
    }
  };

  const handleGallerySelect = async (fileType: 'quote' | 'purchase-order' | 'invoice' | 'delivery-note') => {
    try {
      const result = await scanningService.selectFromGallery();
      
      if (result.success && result.base64Data) {
        const file = scanningService.base64ToFile(result.base64Data, result.fileName!);
        await handleFileUpload(file, fileType);
        
        toast({
          title: "Image Selected!",
          description: `${fileTypeLabels[fileType]} has been selected successfully.`
        });
      } else {
        toast({
          title: "Selection Failed",
          description: result.error || "Failed to select image",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error selecting from gallery:', error);
      toast({
        title: "Selection Error",
        description: "Unable to access photo library. Please try manual upload.",
        variant: "destructive",
      });
    }
  };

  const startScanning = async (fileType: 'quote' | 'purchase-order' | 'invoice' | 'delivery-note') => {
    try {
      setScanningFiles(prev => ({ ...prev, [fileType]: true }));
      setCurrentScanType(fileType);
      
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      });
      
      setStream(mediaStream);
      setIsScanning(true);
      
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      
      toast({
        title: "Camera Started",
        description: "Position your document and click capture when ready."
      });
    } catch (error) {
      console.error('Error starting camera:', error);
      toast({
        title: "Camera Error",
        description: "Unable to access camera. Please check permissions.",
        variant: "destructive",
      });
      setScanningFiles(prev => ({ ...prev, [fileType]: false }));
    }
  };

  const captureDocument = async () => {
    if (!videoRef.current || !canvasRef.current || !currentScanType) return;
    
    try {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      const context = canvas.getContext('2d');
      
      if (!context) return;

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const fileName = `scanned-${currentScanType}-${timestamp}.jpg`;
        const file = new File([blob], fileName, { type: 'image/jpeg' });
        
        stopScanning();
        await handleFileUpload(file, currentScanType);
        
        toast({
          title: "Document Captured",
          description: `Scanned document saved as ${fileName}`
        });
      }, 'image/jpeg', 0.8);
    } catch (error) {
      console.error('Error capturing document:', error);
      toast({
        title: "Capture Error",
        description: "Failed to capture document. Please try again.",
        variant: "destructive"
      });
    }
  };

  const stopScanning = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setIsScanning(false);
    setCurrentScanType(null);
    if (currentScanType) {
      setScanningFiles(prev => ({ ...prev, [currentScanType]: false }));
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
                accept=".pdf,.jpg,.jpeg,.png"
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
              Supported formats: PDF, JPG, PNG (Max 10MB)
            </p>
          </div>
          
          <div className="space-y-3">
            {/* Printer Scanning Section */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={discoverPrinters}
                    disabled={isDiscovering || autoDiscoveryRunning}
                    className="flex items-center gap-2"
                  >
                    {(isDiscovering || autoDiscoveryRunning) ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                    ) : (
                      <Search className="h-4 w-4" />
                    )}
                    {isDiscovering ? "Searching..." : autoDiscoveryRunning ? "Auto-discovering..." : "Refresh Devices"}
                  </Button>
                  
                  {autoDiscoveryRunning && (
                    <span className="text-xs text-muted-foreground">
                      Auto-discovering network printers...
                    </span>
                  )}
                </div>
                
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowManualIP(!showManualIP)}
                  className="flex items-center gap-2"
                >
                  <Wifi className="h-4 w-4" />
                  Add Network Printer
                </Button>
              </div>
              
              <div className="flex items-center gap-2">
                {printers.length > 0 && (
                  <span className="text-sm text-muted-foreground">
                    {printers.length} device(s) available
                  </span>
                )}
                
                {autoDiscoveryRunning && (
                  <span className="text-xs text-blue-600 flex items-center gap-1">
                    <div className="animate-pulse w-2 h-2 bg-blue-600 rounded-full"></div>
                    Auto-discovering...
                  </span>
                 )}
               </div>
               
               {printers.length > 0 && (
                <div className="grid gap-2 max-h-32 overflow-y-auto border rounded-lg p-2">
                  {printers.map((printer) => (
                    <Button
                      key={printer.id}
                      onClick={() => handlePrinterScan(printer, fileType)}
                      disabled={scanningFiles[fileType]}
                      variant="outline"
                      size="sm"
                      className="flex items-center justify-between text-left h-auto py-2"
                    >
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${
                          printer.type === 'network' ? 'bg-blue-500' :
                          printer.type === 'usb' ? 'bg-green-500' : 
                          'bg-purple-500'
                        }`} />
                        <div>
                          <div className="font-medium text-sm">{printer.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {printer.type === 'usb' ? 'USB Device' : 
                             printer.type === 'bluetooth' ? 'Bluetooth' : 
                             printer.ip || 'Network Device'}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Printer className="h-3 w-3" />
                        <span className="text-xs">Scan</span>
                      </div>
                    </Button>
                  ))}
                </div>
              )}
            </div>

            {/* Manual IP Input */}
            {showManualIP && (
              <div className="border rounded-lg p-3 bg-muted/50">
                <Label htmlFor="printer-ip" className="text-sm font-medium">
                  Network Printer IP Address
                </Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    id="printer-ip"
                    type="text"
                    placeholder="e.g., 192.168.1.100"
                    value={manualIPInput}
                    onChange={(e) => setManualIPInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && addNetworkPrinter()}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={addNetworkPrinter}
                    disabled={isDiscovering || !manualIPInput.trim()}
                  >
                    Add
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Enter the IP address of your network printer (e.g., HP, Canon, Brother)
                </p>
              </div>
            )}

            {/* Alternative Methods */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleNativeScan(fileType)}
                disabled={scanningFiles[fileType]}
                className="w-full"
              >
                {scanningFiles[fileType] ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                ) : (
                  <Camera className="h-4 w-4" />
                )}
                Camera Scan
              </Button>
              
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleGallerySelect(fileType)}
                className="w-full"
              >
                <ImageIcon className="h-4 w-4" />
                From Gallery
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => startScanning(fileType)}
                className="w-full"
              >
                <Scan className="h-4 w-4" />
                Web Camera
              </Button>
            </div>
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
      
      // Auto-discover printers when dialog opens
      autoDiscoverPrinters();
    }
    setIsNativeDevice(Capacitor.isNativePlatform());
  }, [isOpen, order?.id]);

  // Periodic auto-discovery every 30 seconds when dialog is open
  useEffect(() => {
    if (!isOpen) return;
    
    const interval = setInterval(() => {
      if (!isDiscovering && !autoDiscoveryRunning) {
        autoDiscoverPrinters();
      }
    }, 30000); // 30 seconds
    
    return () => clearInterval(interval);
  }, [isOpen, isDiscovering, autoDiscoveryRunning]);

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

  useEffect(() => {
    if (!isOpen && stream) {
      stopScanning();
    }
  }, [isOpen, stream]);

  if (!order) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Files for Order #{order.orderNumber}</DialogTitle>
          <DialogDescription>
            Manage and upload files for this order. You can scan documents using your device camera, select from gallery, or connect directly to printers and scanners using Chrome's device access APIs.
          </DialogDescription>
        </DialogHeader>

        {isScanning && (
          <div className="fixed inset-0 z-50 bg-black bg-opacity-75 flex items-center justify-center">
            <div className="bg-white p-4 rounded-lg max-w-2xl w-full mx-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">Scan Document</h3>
                <Button variant="outline" onClick={stopScanning}>
                  Cancel
                </Button>
              </div>
              
              <div className="relative">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  className="w-full h-64 object-cover rounded border"
                />
                <canvas ref={canvasRef} className="hidden" />
              </div>
              
              <div className="flex justify-center mt-4 gap-2">
                <Button onClick={captureDocument} className="bg-green-600 hover:bg-green-700">
                  <Scan className="h-4 w-4 mr-2" />
                  Capture Document
                </Button>
                <Button variant="outline" onClick={stopScanning}>
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}

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
