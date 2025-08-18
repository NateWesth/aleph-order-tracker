import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource, Photo } from '@capacitor/camera';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Device } from '@capacitor/device';

export interface ScanResult {
  success: boolean;
  filePath?: string;
  fileName?: string;
  base64Data?: string;
  error?: string;
}

export interface PrinterDevice {
  id: string;
  name: string;
  ip: string;
  model?: string;
  status: 'online' | 'offline' | 'unknown';
  canScan?: boolean;
}

export class NativeScanningService {
  private static instance: NativeScanningService;

  public static getInstance(): NativeScanningService {
    if (!NativeScanningService.instance) {
      NativeScanningService.instance = new NativeScanningService();
    }
    return NativeScanningService.instance;
  }

  /**
   * Request camera permissions
   */
  async requestCameraPermissions(): Promise<boolean> {
    try {
      if (!Capacitor.isNativePlatform()) {
        return true; // Web doesn't need explicit permission request
      }

      const permissions = await Camera.requestPermissions({
        permissions: ['camera', 'photos']
      });

      return permissions.camera === 'granted' && permissions.photos === 'granted';
    } catch (error) {
      console.error('Error requesting camera permissions:', error);
      return false;
    }
  }

  /**
   * Check if camera permissions are granted
   */
  async checkCameraPermissions(): Promise<boolean> {
    try {
      if (!Capacitor.isNativePlatform()) {
        return true; // Web has implicit permissions
      }

      const permissions = await Camera.checkPermissions();
      return permissions.camera === 'granted' && permissions.photos === 'granted';
    } catch (error) {
      console.error('Error checking camera permissions:', error);
      return false;
    }
  }

  /**
   * Scan a document using device camera
   */
  async scanDocument(): Promise<ScanResult> {
    try {
      // Check permissions first
      const hasPermissions = await this.checkCameraPermissions();
      if (!hasPermissions) {
        const granted = await this.requestCameraPermissions();
        if (!granted) {
          return {
            success: false,
            error: 'Camera permissions are required to scan documents'
          };
        }
      }

      // Take photo using camera
      const photo = await Camera.getPhoto({
        quality: 90,
        allowEditing: true,
        resultType: CameraResultType.Base64,
        source: CameraSource.Camera,
        correctOrientation: true,
        width: 1920,
        height: 1920
      });

      if (!photo.base64String) {
        return {
          success: false,
          error: 'Failed to capture image'
        };
      }

      // Generate filename
      const timestamp = new Date().getTime();
      const fileName = `scan-${timestamp}.jpg`;

      if (Capacitor.isNativePlatform()) {
        // Save to device storage on native platforms
        const savedFile = await this.saveToDevice(photo.base64String, fileName);
        return {
          success: true,
          filePath: savedFile.uri,
          fileName,
          base64Data: photo.base64String
        };
      } else {
        // For web, return base64 data directly
        return {
          success: true,
          fileName,
          base64Data: photo.base64String
        };
      }
    } catch (error) {
      console.error('Error scanning document:', error);
      return {
        success: false,
        error: `Failed to scan document: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Select an image from gallery/photos
   */
  async selectFromGallery(): Promise<ScanResult> {
    try {
      // Check permissions first
      const hasPermissions = await this.checkCameraPermissions();
      if (!hasPermissions) {
        const granted = await this.requestCameraPermissions();
        if (!granted) {
          return {
            success: false,
            error: 'Photo library permissions are required'
          };
        }
      }

      // Select photo from gallery
      const photo = await Camera.getPhoto({
        quality: 90,
        allowEditing: true,
        resultType: CameraResultType.Base64,
        source: CameraSource.Photos,
        correctOrientation: true,
        width: 1920,
        height: 1920
      });

      if (!photo.base64String) {
        return {
          success: false,
          error: 'Failed to select image'
        };
      }

      // Generate filename
      const timestamp = new Date().getTime();
      const fileName = `selected-${timestamp}.jpg`;

      if (Capacitor.isNativePlatform()) {
        // Save to device storage on native platforms
        const savedFile = await this.saveToDevice(photo.base64String, fileName);
        return {
          success: true,
          filePath: savedFile.uri,
          fileName,
          base64Data: photo.base64String
        };
      } else {
        // For web, return base64 data directly
        return {
          success: true,
          fileName,
          base64Data: photo.base64String
        };
      }
    } catch (error) {
      console.error('Error selecting from gallery:', error);
      return {
        success: false,
        error: `Failed to select image: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Save base64 image to device storage
   */
  private async saveToDevice(base64Data: string, fileName: string) {
    try {
      const result = await Filesystem.writeFile({
        path: fileName,
        data: base64Data,
        directory: Directory.Cache,
        encoding: Encoding.UTF8
      });

      return result;
    } catch (error) {
      console.error('Error saving file to device:', error);
      throw error;
    }
  }

  /**
   * Convert base64 to File object for web upload
   */
  base64ToFile(base64Data: string, fileName: string): File {
    const byteCharacters = atob(base64Data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new File([byteArray], fileName, { type: 'image/jpeg' });
  }

  /**
   * Check if scanning is available on current platform
   */
  async isScanningAvailable(): Promise<boolean> {
    try {
      if (Capacitor.isNativePlatform()) {
        const info = await Device.getInfo();
        return info.platform === 'ios' || info.platform === 'android';
      }
      // Check if browser supports camera API
      return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    } catch (error) {
      console.error('Error checking scanning availability:', error);
      return false;
    }
  }

  /**
   * Discover network printers
   */
  async discoverPrinters(): Promise<PrinterDevice[]> {
    try {
      // Get local network information
      const printers: PrinterDevice[] = [];
      
      // Common printer ports and protocols
      const commonPorts = [631, 9100, 515]; // IPP, RAW, LPR
      const networkPrefix = this.getNetworkPrefix();
      
      if (networkPrefix) {
        // Scan common printer IP ranges
        const scanPromises = [];
        for (let i = 1; i <= 254; i++) {
          const ip = `${networkPrefix}.${i}`;
          scanPromises.push(this.checkPrinterAtIP(ip));
        }
        
        const results = await Promise.allSettled(scanPromises);
        results.forEach((result, index) => {
          if (result.status === 'fulfilled' && result.value) {
            printers.push(result.value);
          }
        });
      }

      return printers;
    } catch (error) {
      console.error('Error discovering printers:', error);
      return [];
    }
  }

  /**
   * Check if a printer exists at given IP
   */
  private async checkPrinterAtIP(ip: string): Promise<PrinterDevice | null> {
    try {
      // Try IPP discovery first
      const response = await fetch(`http://${ip}:631/`, {
        method: 'GET',
        signal: AbortSignal.timeout(2000)
      });
      
      if (response.ok) {
        return {
          id: `printer-${ip}`,
          name: `Network Printer (${ip})`,
          ip,
          status: 'online',
          canScan: true
        };
      }
      
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get network prefix for scanning
   */
  private getNetworkPrefix(): string | null {
    try {
      // This is a simplified approach - in a real app you'd use more sophisticated network discovery
      return '192.168.1'; // Most common home network
    } catch (error) {
      return null;
    }
  }

  /**
   * Scan from a specific printer
   */
  async scanFromPrinter(printer: PrinterDevice): Promise<ScanResult> {
    try {
      // For now, implement a basic scanning protocol
      // This would typically use printer-specific APIs or protocols like WSD, eSCL, or proprietary APIs
      
      const scanRequest = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'scan',
          format: 'jpeg',
          resolution: 300,
          colorMode: 'color'
        })
      };

      // Try eSCL (AirScan) protocol first
      let response = await fetch(`http://${printer.ip}:80/eSCL/ScannerStatus`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });

      if (response.ok) {
        // Initiate scan using eSCL
        response = await fetch(`http://${printer.ip}:80/eSCL/ScanJobs`, {
          method: 'POST',
          headers: {
            'Content-Type': 'text/xml',
          },
          body: `<?xml version="1.0" encoding="UTF-8"?>
            <scan:ScanSettings xmlns:scan="http://schemas.hp.com/imaging/escl/2011/05/03" xmlns:pwg="http://www.pwg.org/schemas/2010/12/sm">
              <pwg:Version>2.0</pwg:Version>
              <scan:Intent>Document</scan:Intent>
              <pwg:ScanRegions>
                <pwg:ScanRegion>
                  <pwg:Height>3300</pwg:Height>
                  <pwg:Width>2550</pwg:Width>
                  <pwg:XOffset>0</pwg:XOffset>
                  <pwg:YOffset>0</pwg:YOffset>
                </pwg:ScanRegion>
              </pwg:ScanRegions>
              <scan:DocumentFormat>image/jpeg</scan:DocumentFormat>
              <scan:XResolution>300</scan:XResolution>
              <scan:YResolution>300</scan:YResolution>
              <scan:ColorMode>RGB24</scan:ColorMode>
            </scan:ScanSettings>`
        });

        if (response.ok) {
          const location = response.headers.get('Location');
          if (location) {
            // Poll for scan completion
            const scanResult = await this.pollForScanCompletion(printer.ip, location);
            return scanResult;
          }
        }
      }

      // Fallback: try WSD (Web Services for Devices) or show manual instruction
      return {
        success: false,
        error: `Unable to scan from printer ${printer.name}. Please ensure the printer supports network scanning and is properly configured.`
      };

    } catch (error) {
      console.error('Error scanning from printer:', error);
      return {
        success: false,
        error: `Failed to scan from printer: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Poll for scan completion
   */
  private async pollForScanCompletion(printerIP: string, jobLocation: string): Promise<ScanResult> {
    const maxAttempts = 30; // 30 seconds timeout
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        const response = await fetch(`http://${printerIP}${jobLocation}`, {
          method: 'GET',
          signal: AbortSignal.timeout(2000)
        });

        if (response.ok) {
          const imageData = await response.blob();
          const base64Data = await this.blobToBase64(imageData);
          
          const timestamp = new Date().getTime();
          const fileName = `printer-scan-${timestamp}.jpg`;

          return {
            success: true,
            fileName,
            base64Data: base64Data.split(',')[1] // Remove data URL prefix
          };
        }

        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
        attempts++;
      } catch (error) {
        attempts++;
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return {
      success: false,
      error: 'Scan timeout - please try again'
    };
  }

  /**
   * Convert blob to base64
   */
  private async blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Get device info for debugging
   */
  async getDeviceInfo() {
    try {
      if (Capacitor.isNativePlatform()) {
        return await Device.getInfo();
      }
      return {
        platform: 'web',
        operatingSystem: navigator.platform,
        userAgent: navigator.userAgent
      };
    } catch (error) {
      console.error('Error getting device info:', error);
      return null;
    }
  }
}