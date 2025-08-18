import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';

export interface HardwareScanner {
  id: string;
  name: string;
  type: 'twain' | 'wia' | 'sane' | 'ipp' | 'usb';
  status: 'available' | 'busy' | 'offline';
  capabilities: string[];
  webInterface?: string;
  driverRequired?: boolean;
}

export interface ScanSettings {
  resolution: number;
  colorMode: 'color' | 'grayscale' | 'bw';
  format: 'pdf' | 'jpg' | 'png';
  duplex?: boolean;
}

export class HardwareScannerService {
  private static instance: HardwareScannerService;

  public static getInstance(): HardwareScannerService {
    if (!HardwareScannerService.instance) {
      HardwareScannerService.instance = new HardwareScannerService();
    }
    return HardwareScannerService.instance;
  }

  /**
   * Main method to discover available hardware scanners
   */
  async discoverHardwareScanners(): Promise<HardwareScanner[]> {
    const scanners: HardwareScanner[] = [];
    
    try {
      // Add system default scanner as primary option
      scanners.push({
        id: 'system-default',
        name: 'System Default Scanner',
        type: 'twain',
        status: 'available',
        capabilities: ['scan', 'preview'],
        webInterface: undefined,
        driverRequired: false
      });

      // Try to detect local USB scanners
      const usbScanners = await this.detectUSBScanners();
      scanners.push(...usbScanners);
      
      // For network scanners, provide manual entry option
      scanners.push({
        id: 'network-manual',
        name: 'Network Scanner (Manual Entry)',
        type: 'ipp',
        status: 'available',
        capabilities: ['scan', 'network'],
        webInterface: undefined,
        driverRequired: false
      });

      console.log(`✅ Found ${scanners.length} scanner options:`, scanners);
      
    } catch (error) {
      console.error('Scanner discovery error:', error);
    }

    return this.deduplicateScanners(scanners);
  }

  /**
   * Detect TWAIN-compatible scanners (Windows/Mac)
   */
  private async detectTWAINScanners(): Promise<HardwareScanner[]> {
    const scanners: HardwareScanner[] = [];

    try {
      // Check for TWAIN interface via browser APIs
      if ('navigator' in window && 'plugins' in navigator) {
        // Look for scanning plugins or ActiveX controls
        const plugins = Array.from(navigator.plugins);
        const scanningPlugins = plugins.filter(plugin => 
          plugin.name.toLowerCase().includes('scan') ||
          plugin.name.toLowerCase().includes('twain') ||
          plugin.name.toLowerCase().includes('wia')
        );

        scanningPlugins.forEach((plugin, index) => {
          scanners.push({
            id: `twain-${index}`,
            name: plugin.name,
            type: 'twain',
            status: 'available',
            capabilities: ['scan', 'preview'],
            driverRequired: true
          });
        });
      }

      // Try to access system scanning via web TWAIN if available
      if ((window as any).DWT) {
        const dwt = (window as any).DWT;
        try {
          const sourceCount = dwt.SourceCount;
          for (let i = 0; i < sourceCount; i++) {
            const sourceName = dwt.GetSourceNameItems(i);
            scanners.push({
              id: `dwt-${i}`,
              name: sourceName,
              type: 'twain',
              status: 'available',
              capabilities: ['scan', 'preview', 'duplex', 'feeder']
            });
          }
        } catch (error) {
          console.log('Dynamic Web TWAIN not fully initialized');
        }
      }
    } catch (error) {
      console.log('TWAIN detection failed:', error);
    }

    return scanners;
  }

  /**
   * Detect WIA scanners (Windows)
   */
  private async detectWIAScanners(): Promise<HardwareScanner[]> {
    const scanners: HardwareScanner[] = [];

    try {
      // Check for Windows Image Acquisition
      if (navigator.userAgent.includes('Windows')) {
        // Use WIA COM interface if available (requires ActiveX)
        try {
          const wia = new (window as any).ActiveXObject('WIA.DeviceManager');
          const devices = wia.DeviceInfos;
          
          for (let i = 1; i <= devices.Count; i++) {
            const device = devices.Item(i);
            if (device.Type === 1) { // Scanner type
              scanners.push({
                id: `wia-${device.DeviceID}`,
                name: device.Properties('Name').Value,
                type: 'wia',
                status: 'available',
                capabilities: ['scan', 'preview']
              });
            }
          }
        } catch (error) {
          console.log('WIA ActiveX not available');
        }
      }
    } catch (error) {
      console.log('WIA detection failed:', error);
    }

    return scanners;
  }

  /**
   * Detect network-connected scanners
   */
  private async discoverNetworkScanners(): Promise<HardwareScanner[]> {
    const scanners: HardwareScanner[] = [];

    try {
      // Scan for IPP (Internet Printing Protocol) scanners
      const ippScanners = await this.scanForIPPDevices();
      scanners.push(...ippScanners);

      // Scan for manufacturer-specific web interfaces
      const webScanners = await this.scanForWebScanners();
      scanners.push(...webScanners);

    } catch (error) {
      console.log('Network scanner discovery failed:', error);
    }

    return scanners;
  }

  /**
   * Scan for IPP-compatible scanners
   */
  private async scanForIPPDevices(): Promise<HardwareScanner[]> {
    const scanners: HardwareScanner[] = [];
    const commonIPPPorts = [631, 8631, 9100];
    
    try {
      // Get local network range
      const localIP = await this.getLocalIPAddress();
      if (!localIP) return scanners;

      const baseIP = localIP.substring(0, localIP.lastIndexOf('.'));
      const scanPromises: Promise<HardwareScanner | null>[] = [];

      // Scan common scanner IP ranges
      for (let i = 10; i <= 250; i += 10) {
        const ip = `${baseIP}.${i}`;
        for (const port of commonIPPPorts) {
          scanPromises.push(this.checkIPPScanner(ip, port));
        }
      }

      const results = await Promise.allSettled(scanPromises);
      results.forEach(result => {
        if (result.status === 'fulfilled' && result.value) {
          scanners.push(result.value);
        }
      });

    } catch (error) {
      console.log('IPP scanner discovery failed:', error);
    }

    return scanners;
  }

  /**
   * Check if there's an IPP scanner at the given IP and port
   */
  private async checkIPPScanner(ip: string, port: number): Promise<HardwareScanner | null> {
    try {
      const response = await fetch(`http://${ip}:${port}/ipp/print`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/ipp',
        },
        signal: AbortSignal.timeout(2000)
      });

      if (response.ok || response.status === 400) { // 400 is expected for IPP without proper request
        return {
          id: `ipp-${ip}-${port}`,
          name: `Network Scanner at ${ip}`,
          type: 'ipp',
          status: 'available',
          capabilities: ['scan', 'network'],
          webInterface: `http://${ip}:${port}`
        };
      }
    } catch (error) {
      // Ignore timeouts and connection errors
    }
    return null;
  }

  /**
   * Scan for web-based scanner interfaces
   */
  private async scanForWebScanners(): Promise<HardwareScanner[]> {
    const scanners: HardwareScanner[] = [];
    
    try {
      const localIP = await this.getLocalIPAddress();
      if (!localIP) return scanners;

      const baseIP = localIP.substring(0, localIP.lastIndexOf('.'));
      const commonScannerIPs = [
        `${baseIP}.10`, `${baseIP}.11`, `${baseIP}.20`, `${baseIP}.100`,
        `${baseIP}.150`, `${baseIP}.200`, `${baseIP}.250`
      ];

      const scanPromises = commonScannerIPs.map(ip => this.checkWebScanner(ip));
      const results = await Promise.allSettled(scanPromises);

      results.forEach(result => {
        if (result.status === 'fulfilled' && result.value) {
          scanners.push(result.value);
        }
      });

    } catch (error) {
      console.log('Web scanner discovery failed:', error);
    }

    return scanners;
  }

  /**
   * Check if there's a web scanner interface at the given IP
   */
  private async checkWebScanner(ip: string): Promise<HardwareScanner | null> {
    const scanPaths = [
      '/scan.html', '/scanner.html', '/webscan', '/scan',
      '/eSCL/ScannerCapabilities', '/ipp/scan'
    ];

    for (const path of scanPaths) {
      try {
        const response = await fetch(`http://${ip}${path}`, {
          method: 'GET',
          signal: AbortSignal.timeout(3000)
        });

        if (response.ok) {
          const text = await response.text();
          if (text.toLowerCase().includes('scan') || 
              text.toLowerCase().includes('scanner') ||
              text.toLowerCase().includes('escl')) {
            
            return {
              id: `web-${ip}`,
              name: `Web Scanner at ${ip}`,
              type: 'ipp',
              status: 'available',
              capabilities: ['scan', 'web-interface'],
              webInterface: `http://${ip}${path}`
            };
          }
        }
      } catch (error) {
        // Continue to next path
      }
    }
    return null;
  }

  /**
   * Detect USB scanners
   */
  private async detectUSBScanners(): Promise<HardwareScanner[]> {
    const scanners: HardwareScanner[] = [];

    try {
      if ('usb' in navigator && (navigator as any).usb.getDevices) {
        // Get already authorized USB devices
        const devices = await (navigator as any).usb.getDevices();
        
        const scannerVendorIds = [
          0x04b8, // Epson
          0x03f0, // HP
          0x04a9, // Canon
          0x04f9, // Brother
          0x0924, // Xerox
          0x413c, // Dell
          0x04da  // Panasonic
        ];

        devices.forEach(device => {
          if (scannerVendorIds.includes(device.vendorId)) {
            scanners.push({
              id: `usb-${device.vendorId}-${device.productId}`,
              name: `${device.manufacturerName || 'Unknown'} ${device.productName || 'Scanner'}`,
              type: 'usb',
              status: 'available',
              capabilities: ['scan', 'usb-direct']
            });
          }
        });
      }
    } catch (error) {
      console.log('USB scanner detection failed:', error);
    }

    return scanners;
  }

  /**
   * Get local IP address for network scanning
   */
  private async getLocalIPAddress(): Promise<string | null> {
    try {
      // Use WebRTC to get local IP
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });
      
      return new Promise((resolve) => {
        pc.createDataChannel('');
        pc.onicecandidate = (event) => {
          if (event.candidate) {
            const ip = event.candidate.candidate.match(/(\d+\.\d+\.\d+\.\d+)/);
            if (ip && ip[1]) {
              pc.close();
              resolve(ip[1]);
            }
          }
        };
        pc.createOffer().then(offer => pc.setLocalDescription(offer));
        
        setTimeout(() => {
          pc.close();
          resolve(null);
        }, 3000);
      });
    } catch (error) {
      console.log('Failed to get local IP:', error);
      return null;
    }
  }

  /**
   * Remove duplicate scanners
   */
  private deduplicateScanners(scanners: HardwareScanner[]): HardwareScanner[] {
    const seen = new Set<string>();
    return scanners.filter(scanner => {
      const key = `${scanner.name}-${scanner.type}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Open device default scanner (system integrated)
   */
  async openSystemDefaultScanner(): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      const platform = navigator.platform.toLowerCase();
      
      if (platform.includes('win')) {
        // Windows - open Windows Scan app directly
        const result = await this.launchSystemScanner({
          id: 'windows-scan',
          name: 'Windows Scan',
          type: 'twain',
          status: 'available',
          capabilities: ['scan']
        });
        return result;
      } else if (platform.includes('mac')) {
        // macOS - open Image Capture
        try {
          window.open('imagecapture:', '_blank');
          return {
            success: true,
            message: 'Opened Image Capture. Select your scanner and complete scanning.'
          };
        } catch (error) {
          return {
            success: false,
            error: 'Unable to open Image Capture. Please open it manually from Applications.'
          };
        }
      } else {
        // Linux or other platforms
        try {
          // Try to open Simple Scan or XSane
          window.open('simple-scan:', '_blank');
          return {
            success: true,
            message: 'Attempting to open system scanner application.'
          };
        } catch (error) {
          return {
            success: false,
            error: 'Please use your system\'s scanning application (like Simple Scan or XSane).'
          };
        }
      }
    } catch (error) {
      console.error('Error opening system default scanner:', error);
      return {
        success: false,
        error: 'Failed to open default scanner. Please use your system\'s scanning application.'
      };
    }
  }

  /**
   * Initiate scan from hardware scanner
   */
  async scanFromHardware(scanner: HardwareScanner, settings?: ScanSettings): Promise<{ success: boolean; message: string; url?: string }> {
    try {
      if (scanner.id === 'system-default') {
        // Use system default scanner
        const result = await this.openSystemDefaultScanner();
        return {
          success: result.success,
          message: result.message || result.error || 'Unknown error',
          url: undefined
        };
      } else if (scanner.id === 'network-manual') {
        // Network scanner handled in UI
        return {
          success: true,
          message: 'Network scanner setup initiated',
          url: undefined
        };
      } else if (scanner.webInterface) {
        // Open web interface for scanning
        await Browser.open({
          url: scanner.webInterface,
          windowName: '_blank',
          toolbarColor: '#ffffff'
        });
        
        return {
          success: true,
          message: `Opened ${scanner.name} web interface for scanning`,
          url: scanner.webInterface
        };
      } else if (scanner.type === 'twain' || scanner.type === 'wia') {
        // For TWAIN/WIA, we need to launch system scanning software
        return await this.launchSystemScanner(scanner);
      } else if (scanner.type === 'usb') {
        return {
          success: false,
          message: 'USB scanner requires manufacturer software to be installed'
        };
      }

      return {
        success: false,
        message: 'Scanner type not supported for direct access'
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to access scanner: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Launch system scanner software
   */
  private async launchSystemScanner(scanner: HardwareScanner): Promise<{ success: boolean; message: string }> {
    try {
      if (navigator.userAgent.includes('Windows')) {
        // Launch Windows Scan app directly
        try {
          // Use the Windows Scan app URI scheme
          window.open('ms-winscan:', '_blank');
          return {
            success: true,
            message: 'Launching Windows Scan app. Select your scanner and scan your document.'
          };
        } catch (error) {
          try {
            // Fallback to launch via Windows 10/11 scan app
            window.open('ms-windows-store://pdp/?productid=9WZDNCRFJ3PV', '_blank');
            return {
              success: true,
              message: 'Opening Windows Store to install Windows Scan app if not available.'
            };
          } catch (err) {
            return {
              success: false,
              message: 'Please manually open Windows Scan app from Start Menu or install it from Microsoft Store.'
            };
          }
        }
      } else if (navigator.userAgent.includes('Mac')) {
        // Try to launch Image Capture on Mac
        await Browser.open({
          url: 'imagecapture://',
          windowName: '_system'
        });
        return {
          success: true,
          message: 'Launching Image Capture application'
        };
      } else {
        return {
          success: false,
          message: 'System scanner launch not supported on this platform'
        };
      }
    } catch (error) {
      return {
        success: false,
        message: 'Failed to launch system scanner application'
      };
    }
  }

  /**
   * Get scanning instructions for hardware scanner
   */
  getScanningInstructions(scanner: HardwareScanner): string[] {
    switch (scanner.type) {
      case 'ipp':
      case 'usb':
        if (scanner.webInterface) {
          return [
            '1. The scanner web interface will open in a new window',
            '2. Place your document on the scanner glass or feeder',
            '3. Select scan settings (resolution, color mode, format)',
            '4. Click "Scan" or "Start Scan" in the interface',
            '5. Save the scanned file to your device',
            '6. Return to this app and upload the scanned file'
          ];
        }
        return [
          '1. Ensure the scanner is connected and powered on',
          '2. Install manufacturer software if not already installed',
          '3. Use the scanner software to scan your document',
          '4. Save the scanned file to your device',
          '5. Return to this app and upload the scanned file'
        ];
      
      case 'twain':
      case 'wia':
        return [
          '1. The system scanning application will launch',
          '2. Select your scanner from the available devices',
          '3. Place document on scanner glass or in feeder',
          '4. Configure scan settings (resolution, color, format)',
          '5. Click "Scan" to capture the document',
          '6. Save the file and return to upload it here'
        ];
      
      default:
        return [
          '1. Follow your scanner manufacturer\'s instructions',
          '2. Scan document using the scanner software',
          '3. Save the file in PDF or image format',
          '4. Return to this app to upload the scanned file'
        ];
    }
  }
}