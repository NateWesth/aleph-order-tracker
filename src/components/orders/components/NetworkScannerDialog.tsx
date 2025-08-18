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
import { HardwareScannerService, HardwareScanner } from "@/services/hardwareScannerService";
import { NativeScanningService } from "@/services/nativeScanningService";

interface HardwareScannerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onScanComplete?: (scannedFile: File) => void;
}

export default function HardwareScannerDialog({
  isOpen,
  onClose,
  onScanComplete
}: HardwareScannerDialogProps) {
  const { toast } = useToast();
  const [scanners, setScanners] = useState<HardwareScanner[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [selectedScanner, setSelectedScanner] = useState<HardwareScanner | null>(null);
  
  const hardwareScannerService = HardwareScannerService.getInstance();
  const nativeScanService = NativeScanningService.getInstance();

  const openDefaultScanner = async () => {
    setLoading(true);
    try {
      console.log('🖨️ Opening device default scanner...');
      const result = await hardwareScannerService.openSystemDefaultScanner();
      
      if (result.success) {
        toast({
          title: "Default Scanner Opened",
          description: result.message || "Device default scanner opened successfully",
          variant: "default"
        });
      } else {
        toast({
          title: "Scanner Access Failed",
          description: result.error || "Failed to open default scanner",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Default scanner error:', error);
      toast({
        title: "Scanner Error",
        description: "Failed to access the device default scanner",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const discoverScanners = async () => {
    setLoading(true);
    try {
      console.log('🔍 Discovering hardware scanners...');
      const discoveredScanners = await hardwareScannerService.discoverHardwareScanners();
      setScanners(discoveredScanners);
      
      console.log(`✅ Found ${discoveredScanners.length} hardware scanners:`, discoveredScanners);
      
      if (discoveredScanners.length === 0) {
        toast({
          title: "No Additional Scanners Found",
          description: "No additional physical scanners detected. Use default scanner instead.",
          variant: "default"
        });
      } else {
        toast({
          title: "Additional Scanners Discovered",
          description: `Found ${discoveredScanners.length} additional physical scanner(s)`,
          variant: "default"
        });
      }
    } catch (error) {
      console.error('Scanner discovery error:', error);
      toast({
        title: "Discovery Failed",
        description: "Failed to discover additional physical scanners. Try default scanner.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const scanWithHardware = async (scanner: HardwareScanner) => {
    setScanning(true);
    setSelectedScanner(scanner);
    
    try {
      console.log(`🖨️ Attempting to scan with: ${scanner.name} (${scanner.type})`);
      
      if (scanner.id === 'network-manual') {
        // Show network scanner input dialog
        const ip = prompt('Enter your network scanner IP address (e.g., 192.168.1.100):');
        if (ip) {
          // Try common scanner web interfaces
          const urls = [
            `http://${ip}`,
            `http://${ip}/scan`,
            `http://${ip}/webscan`,
            `http://${ip}/scanner.html`,
            `https://${ip}`
          ];
          
          for (const url of urls) {
            try {
              window.open(url, '_blank');
              toast({
                title: "Network Scanner Opened",
                description: `Opened ${url} - If this doesn't work, try the next URL manually.`,
                variant: "default"
              });
              break;
            } catch (error) {
              continue;
            }
          }
        }
        return;
      }
      
      const result = await hardwareScannerService.scanFromHardware(scanner);
      
      if (result.success) {
        toast({
          title: "Scanner Opened",
          description: result.message,
          variant: "default"
        });
      } else {
        toast({
          title: "Scanner Access Failed",
          description: result.message,
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Hardware scanning error:', error);
      toast({
        title: "Scanning Error",
        description: "Failed to access the physical scanner",
        variant: "destructive"
      });
    } finally {
      setScanning(false);
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
      discoverScanners();
    }
  }, [isOpen]);

  const ScannerCard = ({ scanner }: { scanner: HardwareScanner }) => (
    <div className="border rounded-lg p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div className="flex items-center space-x-3">
          <Printer className="h-8 w-8 text-primary" />
          <div>
            <h4 className="font-medium">{scanner.name}</h4>
            <p className="text-sm text-muted-foreground">Type: {scanner.type.toUpperCase()}</p>
            <div className="flex gap-1 mt-1">
              <Badge 
                variant={scanner.status === 'available' ? 'default' : 'secondary'}
                className={scanner.status === 'available' ? 'bg-green-500' : ''}
              >
                {scanner.status}
              </Badge>
              {scanner.capabilities.map(cap => (
                <Badge key={cap} variant="outline" className="text-xs">
                  {cap}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </div>

      <Button
        onClick={() => scanWithHardware(scanner)}
        disabled={scanning || scanner.status !== 'available'}
        className="w-full flex items-center gap-2"
      >
        <ScanLine className="h-4 w-4" />
        {scanning && selectedScanner?.id === scanner.id 
          ? 'Opening Scanner...' 
          : 'Start Scanning'
        }
      </Button>

      <div className="bg-muted rounded-lg p-3">
        <h5 className="font-medium text-sm mb-2">Instructions:</h5>
        <ul className="text-xs text-muted-foreground space-y-1">
          {hardwareScannerService.getScanningInstructions(scanner).map((instruction, index) => (
            <li key={index}>{instruction}</li>
          ))}
        </ul>
      </div>
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Physical Scanner Access</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="hardware" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="hardware">Hardware Scanners</TabsTrigger>
            <TabsTrigger value="camera">Camera Backup</TabsTrigger>
          </TabsList>

          <TabsContent value="hardware" className="space-y-4">
            <div className="space-y-4">
              <h3 className="text-lg font-medium">Device Default Scanner</h3>
              <p className="text-sm text-muted-foreground">
                Use your device's default scanning application
              </p>
              
              <Button
                onClick={openDefaultScanner}
                disabled={loading}
                className="w-full flex items-center gap-2"
                size="lg"
              >
                <Printer className="h-5 w-5" />
                {loading ? 'Opening Default Scanner...' : 'Open Default Scanner'}
              </Button>
            </div>

            <div className="border-t pt-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium">Additional Scanners</h3>
                <Button
                  onClick={discoverScanners}
                  disabled={loading}
                  variant="outline"
                  className="flex items-center gap-2"
                >
                  {loading ? (
                    <ScanLine className="h-4 w-4 animate-spin" />
                  ) : (
                    <Printer className="h-4 w-4" />
                  )}
                  {loading ? 'Discovering...' : 'Find More'}
                </Button>
              </div>
            </div>
            
            {loading && scanners.length === 0 && (
              <div className="text-center py-8">
                <ScanLine className="h-8 w-8 animate-spin mx-auto mb-2 text-muted-foreground" />
                <p className="text-muted-foreground">Scanning for physical scanners...</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Checking USB, network, and system scanners...
                </p>
              </div>
            )}

            <div className="space-y-3">
              {scanners.map(scanner => (
                <ScannerCard key={scanner.id} scanner={scanner} />
              ))}
            </div>

            {scanners.length === 0 && !loading && (
              <div className="text-center py-8">
                <Printer className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-muted-foreground">No physical scanners detected</p>
                <p className="text-sm text-muted-foreground">
                  Ensure your scanner is connected and powered on, then try refreshing
                </p>
              </div>
            )}

            <div className="bg-muted rounded-lg p-4">
              <h4 className="font-medium mb-2">Troubleshooting:</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Ensure scanner is connected via USB or network</li>
                <li>• Check that scanner drivers are installed</li>
                <li>• For network scanners, verify they're on the same network</li>
                <li>• Try using manufacturer's scanning software directly</li>
                <li>• Use camera backup if hardware scanner isn't available</li>
              </ul>
            </div>
          </TabsContent>

          <TabsContent value="camera" className="space-y-4">
            <div className="space-y-4">
              <h3 className="text-lg font-medium">Camera Scanning (Backup)</h3>
              <p className="text-sm text-muted-foreground">
                Use device camera if physical scanner is not available
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