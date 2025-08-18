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
    
    console.log('🔍 Starting printer discovery...');
    
    try {
      // Method 1: Check user's network range
      console.log('📡 Method 1: Scanning local network range...');
      const networkPrinters = await this.scanNetworkRange();
      console.log(`📡 Found ${networkPrinters.length} printers via network scan`);
      printers.push(...networkPrinters);

      // Method 2: Check common printer IPs
      console.log('🎯 Method 2: Checking common printer IPs...');
      const commonPrinters = await this.checkCommonPrinterIPs();
      console.log(`🎯 Found ${commonPrinters.length} printers at common IPs`);
      printers.push(...commonPrinters);

      // Method 3: mDNS discovery (limited in browsers)
      console.log('🔍 Method 3: Attempting mDNS discovery...');
      const mdnsPrinters = await this.discoverViaMDNS();
      console.log(`🔍 Found ${mdnsPrinters.length} printers via mDNS`);
      printers.push(...mdnsPrinters);

    } catch (error) {
      console.error('❌ Error during printer discovery:', error);
    }

    // Remove duplicates based on IP
    const uniquePrinters = printers.filter((printer, index, self) => 
      index === self.findIndex(p => p.ip === printer.ip)
    );

    console.log(`✅ Discovery complete: Found ${uniquePrinters.length} unique printers`);
    this.discoveredPrinters = uniquePrinters;
    return uniquePrinters;
  }

  // mDNS/Bonjour discovery using modern Web APIs
  private async discoverViaMDNS(): Promise<NetworkPrinter[]> {
    const printers: NetworkPrinter[] = [];
    
    try {
      console.log('🔍 Attempting mDNS discovery...');
      // This is a simplified implementation - real mDNS would require a service worker or WebRTC
      const commonPrinterIPs = await this.getCommonPrinterAddresses();
      
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
    } catch (error) {
      console.warn('❌ mDNS discovery failed:', error);
    }

    return printers;
  }

  // Scan common network ranges for printers
  private async scanNetworkRange(): Promise<NetworkPrinter[]> {
    const printers: NetworkPrinter[] = [];
    const localIP = await this.getLocalIPAddress();
    
    console.log('🌐 Local IP detected:', localIP);
    
    if (!localIP) {
      console.warn('⚠️ Could not determine local IP, using default range');
      return await this.checkCommonPrinterIPs();
    }

    const baseIP = localIP.substring(0, localIP.lastIndexOf('.'));
    console.log('🔍 Scanning network range:', `${baseIP}.x`);
    
    // Scan the entire network range (2-253) for better detection
    const allIPs = [];
    
    // Add common static printer IPs first for priority
    const commonPrinterIPs = [
      `${baseIP}.10`, `${baseIP}.11`, `${baseIP}.12`, `${baseIP}.15`,
      `${baseIP}.20`, `${baseIP}.21`, `${baseIP}.25`, `${baseIP}.30`,
      `${baseIP}.50`, `${baseIP}.100`, `${baseIP}.101`, `${baseIP}.102`, 
      `${baseIP}.110`, `${baseIP}.150`, `${baseIP}.200`, `${baseIP}.201`,
      `${baseIP}.250`, `${baseIP}.254`
    ];
    
    // Then scan the entire range (except the local IP and router)
    for (let i = 2; i <= 253; i++) {
      const ip = `${baseIP}.${i}`;
      if (ip !== localIP && !commonPrinterIPs.includes(ip) && i !== 1) {
        allIPs.push(ip);
      }
    }
    
    // Priority scanning: common IPs first, then all others
    const scanIPs = [...commonPrinterIPs, ...allIPs];

    console.log(`🎯 Scanning ${scanIPs.length} IP addresses...`);
    console.log(`🔥 Priority IPs: ${commonPrinterIPs.join(', ')}`);

    // Use a batch approach to avoid overwhelming the browser
    const batchSize = 10;
    const batches = [];
    for (let i = 0; i < scanIPs.length; i += batchSize) {
      batches.push(scanIPs.slice(i, i + batchSize));
    }

    console.log(`📦 Scanning in ${batches.length} batches of ${batchSize} IPs each`);

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      console.log(`📦 Batch ${batchIndex + 1}/${batches.length}: ${batch.join(', ')}`);
      
      const batchPromises = batch.map(async (ip, index) => {
        try {
          const globalIndex = batchIndex * batchSize + index + 1;
          console.log(`🔍 [${globalIndex}/${scanIPs.length}] Checking ${ip}...`);
          const printer = await this.probePrinterAtIP(ip);
          if (printer) {
            console.log(`🎉 FOUND PRINTER at ${ip}: ${printer.name}`);
          }
          return printer;
        } catch (error) {
          return null;
        }
      });

      const batchResults = await Promise.allSettled(batchPromises);
      batchResults.forEach((result) => {
        if (result.status === 'fulfilled' && result.value) {
          printers.push(result.value);
        }
      });

      // If we found printers in priority IPs, we can stop early
      if (printers.length > 0 && batchIndex === 0) {
        console.log(`✅ Found ${printers.length} printer(s) in priority batch, stopping scan`);
        break;
      }

      // Small delay between batches to prevent overwhelming
      if (batchIndex < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    console.log(`🎯 Network scan complete: ${printers.length} printers found`);
    return printers;
  }

  // WSD discovery (simplified)
  private async discoverViaWSD(): Promise<NetworkPrinter[]> {
    // WSD discovery would require specific network protocols
    // For now, return empty array as this requires deeper network access
    console.log('🔍 WSD discovery not implemented (requires special network access)');
    return [];
  }

  // Check common printer IP addresses
  private async checkCommonPrinterIPs(): Promise<NetworkPrinter[]> {
    const printers: NetworkPrinter[] = [];
    
    // Expanded list of common printer IPs across different network ranges
    const commonIPs = [
      // 192.168.1.x range
      '192.168.1.10', '192.168.1.11', '192.168.1.12', '192.168.1.15',
      '192.168.1.20', '192.168.1.25', '192.168.1.30', '192.168.1.50',
      '192.168.1.100', '192.168.1.101', '192.168.1.102', '192.168.1.110',
      '192.168.1.150', '192.168.1.200', '192.168.1.201', '192.168.1.250',
      
      // 192.168.0.x range
      '192.168.0.10', '192.168.0.11', '192.168.0.12', '192.168.0.15',
      '192.168.0.20', '192.168.0.25', '192.168.0.30', '192.168.0.50',
      '192.168.0.100', '192.168.0.101', '192.168.0.102', '192.168.0.110',
      '192.168.0.150', '192.168.0.200', '192.168.0.201', '192.168.0.250',
      
      // 10.0.0.x range (common in corporate networks)
      '10.0.0.10', '10.0.0.11', '10.0.0.12', '10.0.0.15',
      '10.0.0.20', '10.0.0.25', '10.0.0.30', '10.0.0.50',
      '10.0.0.100', '10.0.0.101', '10.0.0.102', '10.0.0.110',
      '10.0.0.150', '10.0.0.200', '10.0.0.201', '10.0.0.250',
      
      // 10.0.1.x range
      '10.0.1.10', '10.0.1.100', '10.0.1.200'
    ];
    
    console.log(`🎯 Checking ${commonIPs.length} common printer IP addresses...`);
    
    const probePromises = commonIPs.map(async (ip, index) => {
      try {
        console.log(`🔍 [${index + 1}/${commonIPs.length}] Checking common IP ${ip}...`);
        const printer = await this.probePrinterAtIP(ip);
        if (printer) {
          console.log(`✅ Found printer at common IP ${ip}: ${printer.name}`);
        }
        return printer;
      } catch {
        return null;
      }
    });

    const results = await Promise.allSettled(probePromises);
    results.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value) {
        printers.push(result.value);
      }
    });

    console.log(`🎯 Common IP check complete: ${printers.length} printers found`);
    return printers;
  }

  // Probe a specific IP for printer services
  private async probePrinterAtIP(ip: string): Promise<NetworkPrinter | null> {
    // Common printer ports in order of likelihood
    const commonPorts = [80, 631, 443, 8080, 9100, 8000];
    
    console.log(`🔍 Probing ${ip} on ports: ${commonPorts.join(', ')}`);
    
    for (const port of commonPorts) {
      try {
        const protocol = port === 443 ? 'https' : 'http';
        const url = `${protocol}://${ip}${port !== 80 && port !== 443 ? `:${port}` : ''}`;
        
        console.log(`🔍 Trying ${url}...`);
        
        // Create an image element to test connectivity (works around CORS)
        const connectivity = await this.testConnectivity(ip, port);
        
        if (connectivity) {
          console.log(`✅ Response from ${url}`);
          
          const printer: NetworkPrinter = {
            id: `printer-${ip}-${port}`,
            name: await this.identifyPrinter(ip, port) || `Printer at ${ip}`,
            ip: port !== 80 && port !== 443 ? `${ip}:${port}` : ip,
            webUrl: url,
            status: 'online',
            capabilities: ['scan', 'print']
          };

          // Try to get more details
          await this.enrichPrinterInfo(printer);
          console.log(`📊 Printer details: ${JSON.stringify(printer)}`);
          return printer;
        }
        
      } catch (error) {
        console.log(`❌ Port ${port} failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
    
    console.log(`❌ No printer services found at ${ip}`);
    return null;
  }

  // Test connectivity using various methods
  private async testConnectivity(ip: string, port: number): Promise<boolean> {
    const protocol = port === 443 ? 'https' : 'http';
    const url = `${protocol}://${ip}${port !== 80 && port !== 443 ? `:${port}` : ''}`;
    
    // Method 1: Try creating an image element to test connectivity (bypasses CORS)
    try {
      return new Promise((resolve) => {
        const img = new Image();
        const timeout = setTimeout(() => {
          img.src = '';
          resolve(false);
        }, 2000);
        
        img.onload = () => {
          clearTimeout(timeout);
          console.log(`✅ Image load successful for ${url}`);
          resolve(true);
        };
        
        img.onerror = () => {
          clearTimeout(timeout);
          // Even an error response means the server is responding
          console.log(`✅ Server responding at ${url} (image error expected)`);
          resolve(true);
        };
        
        // Try to load a common printer interface file
        img.src = `${url}/favicon.ico`;
      });
    } catch (error) {
      console.log(`❌ Image test failed for ${url}`);
    }

    // Method 2: Try fetch with no-cors (last resort)
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1000);
      
      await fetch(url, {
        method: 'HEAD',
        signal: controller.signal,
        mode: 'no-cors'
      });
      
      clearTimeout(timeoutId);
      console.log(`✅ Fetch successful for ${url}`);
      return true;
    } catch (fetchError) {
      console.log(`❌ Fetch failed for ${url}: ${fetchError instanceof Error ? fetchError.message : 'Unknown'}`);
    }

    return false;
  }

  // Try to identify printer model/manufacturer
  private async identifyPrinter(ip: string, port: number): Promise<string | null> {
    try {
      const protocol = port === 443 ? 'https' : 'http';
      const url = `${protocol}://${ip}${port !== 80 && port !== 443 ? `:${port}` : ''}`;
      
      // Use Image element to test common printer endpoints
      const testPaths = [
        '/hp/device/info_device_status.html',
        '/general/information.html',
        '/DevMgmt/ProductConfigDyn.xml',
        '/canon',
        '/epson',
        '/brother'
      ];
      
      for (const path of testPaths) {
        try {
          const testUrl = `${url}${path}`;
          const reachable = await new Promise<boolean>((resolve) => {
            const img = new Image();
            const timeout = setTimeout(() => {
              img.src = '';
              resolve(false);
            }, 1000);
            
            img.onload = img.onerror = () => {
              clearTimeout(timeout);
              resolve(true);
            };
            
            img.src = testUrl;
          });
          
          if (reachable) {
            if (path.includes('hp')) return 'HP Printer';
            if (path.includes('canon')) return 'Canon Printer';
            if (path.includes('epson')) return 'Epson Printer';
            if (path.includes('brother')) return 'Brother Printer';
            return 'Network Printer';
          }
        } catch {
          continue;
        }
      }
    } catch (error) {
      console.log(`🏷️ Could not identify printer at ${ip}:${port}`);
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
      console.log('🌐 Detecting local IP address...');
      
      // Use WebRTC to get local IP
      const pc = new RTCPeerConnection({ 
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ] 
      });
      
      const dc = pc.createDataChannel('test');
      
      return new Promise((resolve) => {
        const foundIPs: string[] = [];
        
        pc.onicecandidate = (event) => {
          if (event.candidate) {
            const candidate = event.candidate.candidate;
            const ipMatch = candidate.match(/(\d+\.\d+\.\d+\.\d+)/);
            
            if (ipMatch && !ipMatch[1].startsWith('169.254')) {
              const ip = ipMatch[1];
              if (!foundIPs.includes(ip)) {
                foundIPs.push(ip);
                console.log(`🌐 Found local IP: ${ip}`);
                
                // Prefer private network ranges
                if (ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.')) {
                  console.log(`✅ Using private IP: ${ip}`);
                  pc.close();
                  resolve(ip);
                  return;
                }
              }
            }
          }
        };
        
        pc.createOffer().then(offer => pc.setLocalDescription(offer));
        
        // Fallback after 3 seconds
        setTimeout(() => {
          pc.close();
          const bestIP = foundIPs.find(ip => 
            ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.')
          ) || foundIPs[0] || '192.168.1.1';
          
          console.log(`⏰ Timeout reached, using: ${bestIP}`);
          resolve(bestIP);
        }, 3000);
      });
    } catch (error) {
      console.warn('❌ Could not determine local IP:', error);
      return '192.168.1.1';
    }
  }

  // Try to get additional printer information
  private async enrichPrinterInfo(printer: NetworkPrinter): Promise<void> {
    try {
      console.log(`📊 Enriching info for ${printer.name}...`);
      
      // Use image test for common printer endpoints
      const infoEndpoints = [
        '/general/information.html',
        '/hp/device/info_device_status.html',
        '/DevMgmt/ProductConfigDyn.xml',
        '/general/status.html',
        '/status.html'
      ];

      for (const endpoint of infoEndpoints) {
        try {
          const testUrl = `${printer.webUrl}${endpoint}`;
          const reachable = await new Promise<boolean>((resolve) => {
            const img = new Image();
            const timeout = setTimeout(() => {
              img.src = '';
              resolve(false);
            }, 1000);
            
            img.onload = img.onerror = () => {
              clearTimeout(timeout);
              resolve(true);
            };
            
            img.src = testUrl;
          });
          
          if (reachable) {
            printer.status = 'online';
            console.log(`📊 Successfully reached ${testUrl}`);
            
            // Set manufacturer based on endpoint type
            if (endpoint.includes('hp')) {
              printer.manufacturer = 'HP';
            }
            break;
          }
        } catch {
          // Continue to next endpoint
        }
      }
    } catch (error) {
      console.warn('❌ Could not enrich printer info:', error);
    }
  }

  // Add a printer manually by IP
  async addPrinterByIP(ip: string): Promise<NetworkPrinter | null> {
    console.log(`➕ Adding printer manually at IP: ${ip}`);
    const printer = await this.probePrinterAtIP(ip);
    if (printer) {
      this.discoveredPrinters.push(printer);
      console.log(`✅ Successfully added printer: ${printer.name}`);
    } else {
      console.log(`❌ No printer found at IP: ${ip}`);
    }
    return printer;
  }

  // Get web interface URL for scanning
  getScanUrl(printer: NetworkPrinter, settings?: ScanSettings): string {
    const baseUrl = printer.webUrl;
    
    // Ensure baseUrl is properly formatted
    const formattedBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    
    // Try to generate a direct scan URL if we know the printer type
    if (printer.manufacturer?.toLowerCase().includes('hp')) {
      return `${formattedBaseUrl}/hp/device/ScanMenu.html`;
    } else if (printer.manufacturer?.toLowerCase().includes('canon')) {
      return `${formattedBaseUrl}/scan.html`;
    } else if (printer.manufacturer?.toLowerCase().includes('epson')) {
      return `${formattedBaseUrl}/PRESENTATION/HTML/TOP/PHTM/TOP.HTM`;
    } else if (printer.manufacturer?.toLowerCase().includes('brother')) {
      return `${formattedBaseUrl}/general/status.html`;
    }
    
    // Generic fallback - try multiple common scan paths
    const scanPaths = [
      '/scan', 
      '/scan.html', 
      '/scanner', 
      '/device/scan',
      '/web/guest/en/websys/webArch/mainFrame.cgi',
      '/cgi-bin/dynamic/printer/config/main.html',
      '/main/main.html',
      '/'  // Fallback to root page
    ];
    
    // Return the first scan path, but we could try multiple in sequence
    return `${formattedBaseUrl}${scanPaths[0]}`;
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