import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Wifi, 
  Search, 
  Plus, 
  Star, 
  StarOff, 
  Monitor, 
  QrCode, 
  RefreshCw,
  ExternalLink,
  Printer
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { NetworkPrinterService } from "@/services/networkPrinterService";

interface NetworkPrinter {
  id: string;
  name: string;
  ip: string;
  model?: string;
  manufacturer?: string;
  webUrl: string;
  status: 'online' | 'offline' | 'unknown';
  capabilities?: string[];
}

interface NetworkScannerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onScanComplete?: (scannedFile: File) => void;
}

export default function NetworkScannerDialog({
  isOpen,
  onClose,
  onScanComplete
}: NetworkScannerDialogProps) {
  const { toast } = useToast();
  const [printers, setPrinters] = useState<NetworkPrinter[]>([]);
  const [loading, setLoading] = useState(false);
  const [manualIP, setManualIP] = useState('');
  const [selectedPrinter, setSelectedPrinter] = useState<NetworkPrinter | null>(null);
  const [showQR, setShowQR] = useState<string | null>(null);
  
  const printerService = NetworkPrinterService.getInstance();

  const discoverPrinters = async () => {
    setLoading(true);
    try {
      const discovered = await printerService.discoverPrinters();
      setPrinters(discovered);
      
      if (discovered.length === 0) {
        toast({
          title: "No Printers Found",
          description: "No network printers were discovered. Try adding one manually.",
          variant: "default"
        });
      } else {
        toast({
          title: "Printers Discovered",
          description: `Found ${discovered.length} network printer(s)`,
          variant: "default"
        });
      }
    } catch (error) {
      console.error('Discovery error:', error);
      toast({
        title: "Discovery Failed",
        description: "Failed to discover network printers. Please try again.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const addManualPrinter = async () => {
    if (!manualIP.trim()) {
      toast({
        title: "Invalid IP",
        description: "Please enter a valid IP address",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      const printer = await printerService.addPrinterByIP(manualIP.trim());
      if (printer) {
        setPrinters(prev => [...prev, printer]);
        setManualIP('');
        toast({
          title: "Printer Added",
          description: `Successfully added printer at ${manualIP}`,
          variant: "default"
        });
      } else {
        toast({
          title: "Printer Not Found",
          description: `No printer found at ${manualIP}`,
          variant: "destructive"
        });
      }
    } catch (error) {
      toast({
        title: "Connection Failed",
        description: "Could not connect to printer at this IP address",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const toggleFavorite = (printer: NetworkPrinter) => {
    if (printerService.isFavorite(printer.id)) {
      printerService.removeFromFavorites(printer.id);
    } else {
      printerService.addToFavorites(printer.id);
    }
    // Force re-render by updating state
    setPrinters([...printers]);
  };

  const openScanInterface = (printer: NetworkPrinter) => {
    const scanUrl = printerService.getScanUrl(printer);
    window.open(scanUrl, '_blank', 'width=800,height=600,scrollbars=yes,resizable=yes');
    
    toast({
      title: "Scan Interface Opened",
      description: "Use the printer's web interface to scan documents. Save files to your device and upload them here.",
      variant: "default"
    });
  };

  const generateQRCode = (printer: NetworkPrinter) => {
    const qrData = printerService.generateQRCodeData(printer);
    setShowQR(qrData);
  };

  const checkPrinterStatus = async (printer: NetworkPrinter) => {
    const status = await printerService.checkPrinterStatus(printer);
    setPrinters(prev => 
      prev.map(p => p.id === printer.id ? { ...p, status } : p)
    );
  };

  useEffect(() => {
    if (isOpen) {
      // Load any previously discovered printers
      const discovered = printerService.getDiscoveredPrinters();
      setPrinters(discovered);
      
      // Auto-discover on open
      if (discovered.length === 0) {
        discoverPrinters();
      }
    }
  }, [isOpen]);

  const PrinterCard = ({ printer }: { printer: NetworkPrinter }) => (
    <div className="border rounded-lg p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div className="flex items-center space-x-3">
          <Printer className="h-8 w-8 text-primary" />
          <div>
            <h4 className="font-medium">{printer.name}</h4>
            <p className="text-sm text-muted-foreground">{printer.ip}</p>
            {printer.model && (
              <p className="text-xs text-muted-foreground">{printer.model}</p>
            )}
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <Badge 
            variant={printer.status === 'online' ? 'default' : 'secondary'}
            className={printer.status === 'online' ? 'bg-green-500' : ''}
          >
            {printer.status}
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => toggleFavorite(printer)}
          >
            {printerService.isFavorite(printer.id) ? (
              <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
            ) : (
              <StarOff className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => openScanInterface(printer)}
          className="flex items-center gap-2"
        >
          <Monitor className="h-4 w-4" />
          Open Scanner
        </Button>
        
        <Button
          variant="outline"
          size="sm"
          onClick={() => generateQRCode(printer)}
          className="flex items-center gap-2"
        >
          <QrCode className="h-4 w-4" />
          QR Code
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => checkPrinterStatus(printer)}
          className="flex items-center gap-2"
        >
          <RefreshCw className="h-4 w-4" />
          Check Status
        </Button>
      </div>

      {printer.capabilities && (
        <div className="flex gap-1">
          {printer.capabilities.map(cap => (
            <Badge key={cap} variant="outline" className="text-xs">
              {cap}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Network Scanner Access</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="discover" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="discover">Auto Discover</TabsTrigger>
            <TabsTrigger value="manual">Manual Setup</TabsTrigger>
          </TabsList>

          <TabsContent value="discover" className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium">Available Printers</h3>
              <Button
                onClick={discoverPrinters}
                disabled={loading}
                className="flex items-center gap-2"
              >
                {loading ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
                {loading ? 'Discovering...' : 'Discover'}
              </Button>
            </div>

            {loading && printers.length === 0 && (
              <div className="text-center py-8">
                <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-2 text-muted-foreground" />
                <p className="text-muted-foreground">Searching for network printers...</p>
              </div>
            )}

            <div className="space-y-3">
              {printerService.getFavoritePrinters().length > 0 && (
                <>
                  <h4 className="font-medium text-sm text-muted-foreground">Favorites</h4>
                  {printerService.getFavoritePrinters().map(printer => (
                    <PrinterCard key={printer.id} printer={printer} />
                  ))}
                </>
              )}

              {printers.filter(p => !printerService.isFavorite(p.id)).length > 0 && (
                <>
                  <h4 className="font-medium text-sm text-muted-foreground">Discovered Printers</h4>
                  {printers.filter(p => !printerService.isFavorite(p.id)).map(printer => (
                    <PrinterCard key={printer.id} printer={printer} />
                  ))}
                </>
              )}

              {printers.length === 0 && !loading && (
                <div className="text-center py-8">
                  <Wifi className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-muted-foreground">No printers discovered</p>
                  <p className="text-sm text-muted-foreground">Try manual setup or check your network connection</p>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="manual" className="space-y-4">
            <div>
              <h3 className="text-lg font-medium mb-4">Add Printer by IP Address</h3>
              
              <div className="space-y-4">
                <div>
                  <Label htmlFor="manual-ip">Printer IP Address</Label>
                  <div className="flex gap-2 mt-1">
                    <Input
                      id="manual-ip"
                      placeholder="192.168.1.100"
                      value={manualIP}
                      onChange={(e) => setManualIP(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && addManualPrinter()}
                    />
                    <Button 
                      onClick={addManualPrinter}
                      disabled={loading || !manualIP.trim()}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Enter the IP address of your network printer/scanner
                  </p>
                </div>

                <div className="bg-muted rounded-lg p-4">
                  <h4 className="font-medium mb-2">How to find your printer's IP:</h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• Check your router's admin panel for connected devices</li>
                    <li>• Print a network configuration page from your printer</li>
                    <li>• Look for the IP address in printer settings menu</li>
                    <li>• Common ranges: 192.168.1.x or 192.168.0.x</li>
                  </ul>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {showQR && (
          <Dialog open={!!showQR} onOpenChange={() => setShowQR(null)}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>Mobile Access QR Code</DialogTitle>
              </DialogHeader>
              <div className="text-center space-y-4">
                <div className="bg-white p-4 rounded-lg inline-block">
                  {/* QR Code would be generated here with a library like qrcode */}
                  <div className="w-48 h-48 bg-gray-100 flex items-center justify-center text-gray-500">
                    QR Code
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  Scan with your mobile device to access the scanner interface
                </p>
                <Button
                  variant="outline"
                  onClick={() => window.open(showQR, '_blank')}
                  className="flex items-center gap-2"
                >
                  <ExternalLink className="h-4 w-4" />
                  Open Link Instead
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </DialogContent>
    </Dialog>
  );
}