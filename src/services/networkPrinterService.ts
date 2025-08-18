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

interface ScanSettings {
  resolution: number;
  format: 'pdf' | 'jpg' | 'png';
  colorMode: 'color' | 'grayscale' | 'bw';
}

export class NetworkPrinterService {
  private static instance: NetworkPrinterService;
  private discoveredPrinters: NetworkPrinter[] = [];
  private favorites: string[] = [];

  private constructor() {
    this.loadFavorites();
  }

  static getInstance(): NetworkPrinterService {
    if (!NetworkPrinterService.instance) {
      NetworkPrinterService.instance = new NetworkPrinterService();
    }
    return NetworkPrinterService.instance;
  }

  // Auto-discover network printers using multiple methods
  async discoverPrinters(): Promise<NetworkPrinter[]> {
    const printers: NetworkPrinter[] = [];
    
    try {
      // Method 1: mDNS/Bonjour discovery (works in modern browsers)
      const mdnsPrinters = await this.discoverViaMDNS();
      printers.push(...mdnsPrinters);

      // Method 2: Common IP range scanning
      const networkPrinters = await this.scanNetworkRange();
      printers.push(...networkPrinters);

      // Method 3: WSD (Web Services for Devices) discovery
      const wsdPrinters = await this.discoverViaWSD();
      printers.push(...wsdPrinters);

    } catch (error) {
      console.error('Error during printer discovery:', error);
    }

    // Remove duplicates based on IP
    const uniquePrinters = printers.filter((printer, index, self) => 
      index === self.findIndex(p => p.ip === printer.ip)
    );

    this.discoveredPrinters = uniquePrinters;
    return uniquePrinters;
  }

  // mDNS/Bonjour discovery using modern Web APIs
  private async discoverViaMDNS(): Promise<NetworkPrinter[]> {
    const printers: NetworkPrinter[] = [];
    
    try {
      // This is a simplified implementation - real mDNS would require a service worker or WebRTC
      // For now, we'll check common printer service names
      const commonPrinterIPs = await this.getCommonPrinterAddresses();
      
      for (const ip of commonPrinterIPs) {
        try {
          const printer = await this.probePrinterAtIP(ip);
          if (printer) {
            printers.push(printer);
          }
        } catch (error) {
          // Printer not found at this IP, continue
        }
      }
    } catch (error) {
      console.warn('mDNS discovery failed:', error);
    }

    return printers;
  }

  // Scan common network ranges for printers
  private async scanNetworkRange(): Promise<NetworkPrinter[]> {
    const printers: NetworkPrinter[] = [];
    const localIP = await this.getLocalIPAddress();
    
    if (!localIP) return printers;

    const baseIP = localIP.substring(0, localIP.lastIndexOf('.'));
    const commonPrinterIPs = [
      `${baseIP}.10`, `${baseIP}.11`, `${baseIP}.12`, `${baseIP}.20`,
      `${baseIP}.100`, `${baseIP}.101`, `${baseIP}.102`, `${baseIP}.200`
    ];

    const probePromises = commonPrinterIPs.map(async (ip) => {
      try {
        const printer = await this.probePrinterAtIP(ip);
        return printer;
      } catch {
        return null;
      }
    });

    const results = await Promise.allSettled(probePromises);
    results.forEach(result => {
      if (result.status === 'fulfilled' && result.value) {
        printers.push(result.value);
      }
    });

    return printers;
  }

  // WSD discovery (simplified)
  private async discoverViaWSD(): Promise<NetworkPrinter[]> {
    // WSD discovery would require specific network protocols
    // For now, return empty array as this requires deeper network access
    return [];
  }

  // Probe a specific IP for printer services
  private async probePrinterAtIP(ip: string): Promise<NetworkPrinter | null> {
    const commonPorts = [80, 443, 631, 8080, 9100];
    
    for (const port of commonPorts) {
      try {
        const url = `${port === 443 ? 'https' : 'http'}://${ip}${port !== 80 && port !== 443 ? `:${port}` : ''}`;
        
        // Try to connect with a very short timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);
        
        const response = await fetch(url, {
          method: 'HEAD',
          signal: controller.signal,
          mode: 'no-cors' // Avoid CORS issues for discovery
        });
        
        clearTimeout(timeoutId);
        
        // If we get here, something responded
        const printer: NetworkPrinter = {
          id: `printer-${ip}`,
          name: `Printer at ${ip}`,
          ip,
          webUrl: url,
          status: 'online',
          capabilities: ['scan', 'print']
        };

        // Try to get more details if possible
        await this.enrichPrinterInfo(printer);
        return printer;
        
      } catch (error) {
        // Continue to next port
      }
    }
    
    return null;
  }

  // Get common printer IP addresses from router/DHCP
  private async getCommonPrinterAddresses(): Promise<string[]> {
    const addresses: string[] = [];
    
    // Common default printer IPs
    const defaults = [
      '192.168.1.100', '192.168.1.101', '192.168.1.200',
      '192.168.0.100', '192.168.0.101', '192.168.0.200',
      '10.0.0.100', '10.0.0.101', '10.0.0.200'
    ];
    
    addresses.push(...defaults);
    return addresses;
  }

  // Get local IP address to determine network range
  private async getLocalIPAddress(): Promise<string | null> {
    try {
      // Use WebRTC to get local IP
      const pc = new RTCPeerConnection({ iceServers: [] });
      const dc = pc.createDataChannel('test');
      
      return new Promise((resolve) => {
        pc.onicecandidate = (event) => {
          if (event.candidate) {
            const candidate = event.candidate.candidate;
            const ipMatch = candidate.match(/(\d+\.\d+\.\d+\.\d+)/);
            if (ipMatch && !ipMatch[1].startsWith('169.254')) {
              resolve(ipMatch[1]);
              pc.close();
            }
          }
        };
        
        pc.createOffer().then(offer => pc.setLocalDescription(offer));
        
        // Fallback after 3 seconds
        setTimeout(() => {
          resolve('192.168.1.1'); // Common default
          pc.close();
        }, 3000);
      });
    } catch (error) {
      console.warn('Could not determine local IP:', error);
      return '192.168.1.1';
    }
  }

  // Try to get additional printer information
  private async enrichPrinterInfo(printer: NetworkPrinter): Promise<void> {
    try {
      // Try common printer info endpoints
      const infoUrls = [
        `${printer.webUrl}/general/information.html`,
        `${printer.webUrl}/hp/device/info_device_status.html`,
        `${printer.webUrl}/DevMgmt/ProductConfigDyn.xml`,
        `${printer.webUrl}/general/status.html`
      ];

      for (const url of infoUrls) {
        try {
          const response = await fetch(url, {
            method: 'GET',
            signal: AbortSignal.timeout(1000)
          });
          
          if (response.ok) {
            // Successfully connected to info page
            printer.status = 'online';
            break;
          }
        } catch {
          // Continue to next URL
        }
      }
    } catch (error) {
      console.warn('Could not enrich printer info:', error);
    }
  }

  // Add a printer manually by IP
  async addPrinterByIP(ip: string): Promise<NetworkPrinter | null> {
    const printer = await this.probePrinterAtIP(ip);
    if (printer) {
      this.discoveredPrinters.push(printer);
    }
    return printer;
  }

  // Get web interface URL for scanning
  getScanUrl(printer: NetworkPrinter, settings?: ScanSettings): string {
    const baseUrl = printer.webUrl;
    
    // Try to generate a direct scan URL if we know the printer type
    if (printer.manufacturer?.toLowerCase().includes('hp')) {
      return `${baseUrl}/hp/device/ScanMenu.html`;
    } else if (printer.manufacturer?.toLowerCase().includes('canon')) {
      return `${baseUrl}/scan.html`;
    } else if (printer.manufacturer?.toLowerCase().includes('epson')) {
      return `${baseUrl}/PRESENTATION/HTML/TOP/PHTM/TOP.HTM`;
    } else if (printer.manufacturer?.toLowerCase().includes('brother')) {
      return `${baseUrl}/general/status.html`;
    }
    
    // Generic fallback URLs
    const scanPaths = ['/scan', '/scan.html', '/scanner', '/device/scan'];
    return `${baseUrl}${scanPaths[0]}`;
  }

  // Generate QR code data for mobile access
  generateQRCodeData(printer: NetworkPrinter): string {
    const scanUrl = this.getScanUrl(printer);
    return scanUrl;
  }

  // Manage favorites
  addToFavorites(printerId: string): void {
    if (!this.favorites.includes(printerId)) {
      this.favorites.push(printerId);
      this.saveFavorites();
    }
  }

  removeFromFavorites(printerId: string): void {
    this.favorites = this.favorites.filter(id => id !== printerId);
    this.saveFavorites();
  }

  isFavorite(printerId: string): boolean {
    return this.favorites.includes(printerId);
  }

  private loadFavorites(): void {
    try {
      const saved = localStorage.getItem('printer-favorites');
      this.favorites = saved ? JSON.parse(saved) : [];
    } catch {
      this.favorites = [];
    }
  }

  private saveFavorites(): void {
    try {
      localStorage.setItem('printer-favorites', JSON.stringify(this.favorites));
    } catch (error) {
      console.warn('Could not save favorites:', error);
    }
  }

  // Get all discovered printers
  getDiscoveredPrinters(): NetworkPrinter[] {
    return this.discoveredPrinters;
  }

  // Get favorite printers
  getFavoritePrinters(): NetworkPrinter[] {
    return this.discoveredPrinters.filter(p => this.isFavorite(p.id));
  }

  // Check printer status
  async checkPrinterStatus(printer: NetworkPrinter): Promise<'online' | 'offline'> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      
      await fetch(printer.webUrl, {
        method: 'HEAD',
        signal: controller.signal,
        mode: 'no-cors'
      });
      
      clearTimeout(timeoutId);
      return 'online';
    } catch {
      return 'offline';
    }
  }
}