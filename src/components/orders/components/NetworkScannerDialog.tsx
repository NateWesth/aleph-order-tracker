import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Smartphone, 
  Camera, 
  FileText, 
  ExternalLink,
  Printer,
  ScanLine,
  Upload,
  CheckCircle
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { NativePrintScanService, NativePrintApp } from "@/services/nativePrintScanService";
import { NativeScanningService } from "@/services/nativeScanningService";

interface NativeScannerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onScanComplete?: (scannedFile: File) => void;
}

export default function NativeScannerDialog({
  isOpen,
  onClose,
  onScanComplete
}: NativeScannerDialogProps) {
  const { toast } = useToast();
  const [apps, setApps] = useState<NativePrintApp[]>([]);
  const [loading, setLoading] = useState(false);
  const [instructions, setInstructions] = useState<string[]>([]);
  const [recommended, setRecommended] = useState<NativePrintApp | null>(null);
  
  const printScanService = NativePrintScanService.getInstance();
  const nativeScanService = NativeScanningService.getInstance();

  const loadScanApps = async () => {
    setLoading(true);
    try {
      const availableApps = await printScanService.getAvailablePrintScanApps();
      const scanInstructions = await printScanService.getScanningInstructions();
      const recommendedApp = await printScanService.getRecommendedScanningMethod();
      
      setApps(availableApps);
      setInstructions(scanInstructions);
      setRecommended(recommendedApp);
      
      toast({
        title: "Scanning Options Ready",
        description: `Found ${availableApps.length} available scanning method(s)`,
        variant: "default"
      });
    } catch (error) {
      console.error('Loading scan apps error:', error);
      toast({
        title: "Setup Failed",
        description: "Failed to load scanning options. Please try again.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const openScanApp = async (app: NativePrintApp) => {
    setLoading(true);
    try {
      const result = await printScanService.openPrintScanApp(app);
      
      if (result.success) {
        toast({
          title: "Scanner Opened",
          description: `${app.name} opened successfully. Scan your document and return to upload.`,
          variant: "default"
        });
      } else {
        toast({
          title: "Failed to Open Scanner",
          description: result.error || "Unable to open the scanning app",
          variant: "destructive"
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to open scanning app",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCameraScan = async () => {
    setLoading(true);
    try {
      const result = await nativeScanService.scanDocument();
      
      if (result.success && result.base64Data) {
        const file = nativeScanService.base64ToFile(result.base64Data, result.fileName || 'scan.jpg');
        onScanComplete?.(file);
        onClose();
        
        toast({
          title: "Document Scanned",
          description: "Document captured successfully",
          variant: "default"
        });
      } else {
        toast({
          title: "Scan Failed",
          description: result.error || "Failed to capture document",
          variant: "destructive"
        });
      }
    } catch (error) {
      toast({
        title: "Camera Error",
        description: "Failed to access camera",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleGallerySelect = async () => {
    setLoading(true);
    try {
      const result = await nativeScanService.selectFromGallery();
      
      if (result.success && result.base64Data) {
        const file = nativeScanService.base64ToFile(result.base64Data, result.fileName || 'image.jpg');
        onScanComplete?.(file);
        onClose();
        
        toast({
          title: "Image Selected",
          description: "Image selected successfully",
          variant: "default"
        });
      } else {
        toast({
          title: "Selection Failed",
          description: result.error || "Failed to select image",
          variant: "destructive"
        });
      }
    } catch (error) {
      toast({
        title: "Gallery Error",
        description: "Failed to access photo gallery",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadScanApps();
    }
  }, [isOpen]);

  const ScanAppCard = ({ app }: { app: NativePrintApp }) => (
    <div className="border rounded-lg p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div className="flex items-center space-x-3">
          {app.type === 'native' ? (
            <Smartphone className="h-8 w-8 text-primary" />
          ) : (
            <ExternalLink className="h-8 w-8 text-primary" />
          )}
          <div>
            <h4 className="font-medium">{app.name}</h4>
            <p className="text-sm text-muted-foreground">{app.description}</p>
            <Badge variant="outline" className="mt-1">
              {app.platform} • {app.type}
            </Badge>
          </div>
        </div>
        {recommended?.id === app.id && (
          <Badge variant="default" className="bg-green-500">
            <CheckCircle className="h-3 w-3 mr-1" />
            Recommended
          </Badge>
        )}
      </div>

      <Button
        onClick={() => openScanApp(app)}
        disabled={loading}
        className="w-full flex items-center gap-2"
      >
        <ScanLine className="h-4 w-4" />
        Open {app.name}
      </Button>
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Document Scanner</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="apps" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="apps">Scanner Apps</TabsTrigger>
            <TabsTrigger value="camera">Camera</TabsTrigger>
          </TabsList>

          <TabsContent value="apps" className="space-y-4">
            <div className="space-y-3">
              <h3 className="text-lg font-medium">Available Scanning Apps</h3>
              
              {loading && apps.length === 0 && (
                <div className="text-center py-8">
                  <ScanLine className="h-8 w-8 animate-spin mx-auto mb-2 text-muted-foreground" />
                  <p className="text-muted-foreground">Loading scanning options...</p>
                </div>
              )}

              {apps.map(app => (
                <ScanAppCard key={app.id} app={app} />
              ))}

              {apps.length === 0 && !loading && (
                <div className="text-center py-8">
                  <FileText className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-muted-foreground">No scanning apps available</p>
                  <p className="text-sm text-muted-foreground">Try using the camera tab instead</p>
                </div>
              )}
            </div>

            {instructions.length > 0 && (
              <div className="bg-muted rounded-lg p-4">
                <h4 className="font-medium mb-3">How to Scan Documents:</h4>
                <ol className="text-sm text-muted-foreground space-y-2">
                  {instructions.map((instruction, index) => (
                    <li key={index}>{instruction}</li>
                  ))}
                </ol>
              </div>
            )}
          </TabsContent>

          <TabsContent value="camera" className="space-y-4">
            <div className="space-y-4">
              <h3 className="text-lg font-medium">Direct Camera Scanning</h3>
              <p className="text-sm text-muted-foreground">
                Use your device camera to capture documents directly
              </p>

              <div className="grid gap-3">
                <Button
                  onClick={handleCameraScan}
                  disabled={loading}
                  className="flex items-center gap-2"
                  size="lg"
                >
                  <Camera className="h-5 w-5" />
                  {loading ? 'Opening Camera...' : 'Scan with Camera'}
                </Button>

                <Button
                  onClick={handleGallerySelect}
                  disabled={loading}
                  variant="outline"
                  className="flex items-center gap-2"
                  size="lg"
                >
                  <Upload className="h-5 w-5" />
                  {loading ? 'Opening Gallery...' : 'Select from Gallery'}
                </Button>
              </div>

              <div className="bg-muted rounded-lg p-4">
                <h4 className="font-medium mb-2">Camera Scanning Tips:</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Ensure good lighting for clear document capture</li>
                  <li>• Place document on a flat, contrasting surface</li>
                  <li>• Hold camera steady and parallel to document</li>
                  <li>• Tap to focus before capturing</li>
                </ul>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}