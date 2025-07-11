
import React, { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Upload, Camera, Check } from "lucide-react";

interface MobileScanPageProps {}

const fileTypeLabels = {
  'quote': 'Quote',
  'purchase-order': 'Purchase Order', 
  'invoice': 'Invoice',
  'delivery-note': 'Delivery Note'
};

export default function MobileScanPage({}: MobileScanPageProps) {
  const { sessionId, orderId, fileType } = useParams<{
    sessionId: string;
    orderId: string;
    fileType: 'quote' | 'purchase-order' | 'invoice' | 'delivery-note';
  }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const [isScanning, setIsScanning] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Verify session is valid (you might want to implement session validation)
  useEffect(() => {
    if (!sessionId || !orderId || !fileType) {
      toast({
        title: "Invalid Link",
        description: "This scanning link is invalid or expired.",
        variant: "destructive",
      });
      return;
    }
  }, [sessionId, orderId, fileType]);

  const startCamera = async () => {
    try {
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
        description: "Position your document and tap capture when ready.",
      });
    } catch (error) {
      console.error('Error starting camera:', error);
      toast({
        title: "Camera Error",
        description: "Unable to access camera. Please check permissions.",
        variant: "destructive",
      });
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setIsScanning(false);
  };

  const captureAndUpload = async () => {
    if (!videoRef.current || !canvasRef.current || !fileType || !orderId || !user?.id) return;

    setUploading(true);
    
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
        const fileName = `mobile-scan-${fileType}-${timestamp}.jpg`;
        const file = new File([blob], fileName, { type: 'image/jpeg' });
        
        // Upload to Supabase storage
        const fileExt = 'jpg';
        const storageFileName = `${orderId}/${fileType}/${Date.now()}.${fileExt}`;
        
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('order-files')
          .upload(storageFileName, file);

        if (uploadError) {
          throw uploadError;
        }

        const { data: urlData } = supabase.storage
          .from('order-files')
          .getPublicUrl(storageFileName);

        // Save file record to database
        const fileRecord = {
          order_id: orderId,
          file_name: fileName,
          file_url: urlData.publicUrl,
          file_type: fileType,
          uploaded_by_role: 'client', // Assuming mobile uploads are from clients
          uploaded_by_user_id: user.id,
          file_size: file.size,
          mime_type: file.type
        };

        const { error: dbError } = await supabase
          .from('order_files')
          .insert(fileRecord);

        if (dbError) {
          throw dbError;
        }

        stopCamera();
        setUploaded(true);
        
        toast({
          title: "Document Scanned!",
          description: `${fileTypeLabels[fileType]} has been uploaded successfully.`,
        });
        
      }, 'image/jpeg', 0.8);
      
    } catch (error) {
      console.error('Error uploading scanned document:', error);
      toast({
        title: "Upload Failed",
        description: "Failed to upload scanned document. Please try again.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const handleFileUpload = async (file: File) => {
    if (!fileType || !orderId || !user?.id) return;

    setUploading(true);
    
    try {
      const fileExt = file.name.split('.').pop();
      const storageFileName = `${orderId}/${fileType}/${Date.now()}.${fileExt}`;
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('order-files')
        .upload(storageFileName, file);

      if (uploadError) {
        throw uploadError;
      }

      const { data: urlData } = supabase.storage
        .from('order-files')
        .getPublicUrl(storageFileName);

      const fileRecord = {
        order_id: orderId,
        file_name: file.name,
        file_url: urlData.publicUrl,
        file_type: fileType,
        uploaded_by_role: 'client',
        uploaded_by_user_id: user.id,
        file_size: file.size,
        mime_type: file.type
      };

      const { error: dbError } = await supabase
        .from('order_files')
        .insert(fileRecord);

      if (dbError) {
        throw dbError;
      }

      setUploaded(true);
      
      toast({
        title: "File Uploaded!",
        description: `${file.name} has been uploaded successfully.`,
      });
      
    } catch (error) {
      console.error('Error uploading file:', error);
      toast({
        title: "Upload Failed",
        description: "Failed to upload file. Please try again.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  if (!sessionId || !orderId || !fileType) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-destructive mb-4">Invalid Link</h1>
          <p className="text-muted-foreground">This scanning link is invalid or expired.</p>
        </div>
      </div>
    );
  }

  if (uploaded) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-green-600 mb-2">Upload Successful!</h1>
          <p className="text-muted-foreground mb-4">
            Your {fileTypeLabels[fileType]} has been uploaded successfully.
          </p>
          <p className="text-sm text-muted-foreground">
            You can now close this page and return to your computer.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-4">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold mb-2">Scan {fileTypeLabels[fileType]}</h1>
            <p className="text-muted-foreground">
              Use your phone's camera to scan the document or upload an existing file.
            </p>
          </div>

          {!isScanning ? (
            <div className="space-y-4">
              <Button 
                onClick={startCamera}
                className="w-full h-16 text-lg"
                size="lg"
              >
                <Camera className="w-6 h-6 mr-2" />
                Start Camera Scan
              </Button>
              
              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-4">Or upload an existing file</p>
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      handleFileUpload(file);
                    }
                  }}
                  className="hidden"
                  id="file-upload"
                />
                <Button 
                  variant="outline"
                  onClick={() => document.getElementById('file-upload')?.click()}
                  className="w-full h-12"
                  disabled={uploading}
                >
                  <Upload className="w-5 h-5 mr-2" />
                  {uploading ? 'Uploading...' : 'Choose File'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="relative bg-black rounded-lg overflow-hidden">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  className="w-full h-80 object-cover"
                />
                <canvas ref={canvasRef} className="hidden" />
              </div>
              
              <div className="flex gap-4">
                <Button
                  onClick={captureAndUpload}
                  disabled={uploading}
                  className="flex-1 h-14 text-lg bg-green-600 hover:bg-green-700"
                >
                  {uploading ? (
                    <>
                      <Upload className="w-5 h-5 mr-2 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Camera className="w-5 h-5 mr-2" />
                      Capture & Upload
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={stopCamera}
                  className="h-14 px-6"
                  disabled={uploading}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
