import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource, Photo } from '@capacitor/camera';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Device } from '@capacitor/device';
import { Browser } from '@capacitor/browser';

// Type definitions for Web APIs
declare global {
  interface Navigator {
    usb?: {
      requestDevice(options: { filters: { vendorId: number }[] }): Promise<USBDevice>;
    };
    bluetooth?: {
      requestDevice(options: { acceptAllDevices?: boolean; filters?: { services: string[] }[] }): Promise<BluetoothDevice>;
    };
  }
}

interface USBDevice {
  vendorId: number;
  productId: number;
  manufacturerName?: string;
  productName?: string;
  open(): Promise<void>;
  close(): Promise<void>;
}

interface BluetoothDevice {
  id: string;
  name?: string;
}

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
  ip?: string;
  model?: string;
  status: 'online' | 'offline' | 'unknown';
  canScan?: boolean;
  type: 'network' | 'usb' | 'bluetooth';
  usbDevice?: USBDevice;
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
      const hasCamera = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
      
      // Check for advanced device access APIs
      const hasUSB = 'usb' in navigator;
      const hasBluetooth = 'bluetooth' in navigator;
      
      console.log('Scanning capabilities:', {
        camera: hasCamera,
        usb: hasUSB,
        bluetooth: hasBluetooth,
        platform: 'web'
      });
      
      return hasCamera; // At minimum, camera scanning should be available
    } catch (error) {
      console.error('Error checking scanning availability:', error);
      return false;
    }
  }

  /**
   * Check if device access APIs are available (USB, Bluetooth)
   */
  async getDeviceAccessCapabilities() {
    return {
      usb: 'usb' in navigator,
      bluetooth: 'bluetooth' in navigator,
      mediaDevices: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
      webRTC: !!(window.RTCPeerConnection || (window as any).webkitRTCPeerConnection),
      permissions: 'permissions' in navigator
    };
  }

  /**
   * Discover available printers and scanners using Web USB API
   */
  async discoverPrinters(): Promise<PrinterDevice[]> {
    try {
      const devices: PrinterDevice[] = [];
      
      if (Capacitor.isNativePlatform()) {
        // For native platforms, use platform-specific APIs
        console.log('Native printer discovery would use platform-specific APIs');
        return [];
      }

      // Web USB API for direct device access (like Chrome)
      if ('usb' in navigator) {
        try {
          console.log('Requesting USB device access...');
          const usbDevices = await navigator.usb!.requestDevice({
            filters: [
              // Common printer/scanner vendor IDs
              { vendorId: 0x04b8 }, // Epson
              { vendorId: 0x03f0 }, // HP
              { vendorId: 0x04a9 }, // Canon
              { vendorId: 0x04f9 }, // Brother
              { vendorId: 0x04b4 }, // Cypress (some scanners)
              { vendorId: 0x0924 }, // Xerox
              { vendorId: 0x04da }, // Panasonic
              { vendorId: 0x0483 }, // STMicroelectronics
            ]
          });

          if (usbDevices) {
            const device: PrinterDevice = {
              id: `usb-${usbDevices.vendorId}-${usbDevices.productId}`,
              name: `${usbDevices.manufacturerName || 'Unknown'} ${usbDevices.productName || 'Device'}`,
              model: usbDevices.productName || 'Unknown Model',
              status: 'online',
              canScan: true,
              type: 'usb',
              usbDevice: usbDevices
            };
            devices.push(device);
          }
        } catch (error) {
          console.log('USB device access denied or not available:', error);
        }
      }

      // Check for Web Bluetooth API (some wireless printers)
      if ('bluetooth' in navigator) {
        try {
          console.log('Checking for Bluetooth printers...');
          const bluetoothDevice = await navigator.bluetooth!.requestDevice({
            acceptAllDevices: false,
            filters: [
              { services: ['000018f0-0000-1000-8000-00805f9b34fb'] } // Print service UUID
            ]
          });

          if (bluetoothDevice) {
            const device: PrinterDevice = {
              id: `bluetooth-${bluetoothDevice.id}`,
              name: bluetoothDevice.name || 'Bluetooth Printer',
              status: 'online',
              canScan: false, // Most Bluetooth printers don't scan
              type: 'bluetooth'
            };
            devices.push(device);
          }
        } catch (error) {
          console.log('Bluetooth device access denied or not available:', error);
        }
      }

      return devices;
    } catch (error) {
      console.error('Error discovering printers:', error);
      return [];
    }
  }

  /**
   * Scan from a specific printer using Web APIs or native access
   */
  async scanFromPrinter(printer: PrinterDevice): Promise<ScanResult> {
    try {
      if (printer.type === 'usb' && printer.usbDevice) {
        return await this.scanFromUSBDevice(printer.usbDevice);
      }

      if (Capacitor.isNativePlatform()) {
        // For native platforms, use platform-specific scanning APIs
        return await this.scanFromNativePrinter(printer);
      }

      // For web, try to open printer's web interface if it's a network printer
      if (printer.ip) {
        return await this.scanFromNetworkPrinter(printer);
      }
      
      return {
        success: false,
        error: 'Scanning from this printer type is not supported. Please use camera scan instead.'
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
   * Scan from USB device using Web USB API
   */
  private async scanFromUSBDevice(usbDevice: USBDevice): Promise<ScanResult> {
    try {
      console.log('Attempting to scan from USB device:', usbDevice.productName);
      
      // Open connection to USB device
      await usbDevice.open();
      
      // This is a simplified example - real implementation would depend on the specific device protocol
      // Different manufacturers use different protocols (ESC/POS, PCL, etc.)
      
      // For now, return an error with instructions
      await usbDevice.close();
      
      return {
        success: false,
        error: 'Direct USB scanning requires device-specific drivers. Please use the camera scan feature instead.'
      };
    } catch (error) {
      console.error('USB scanning error:', error);
      return {
        success: false,
        error: `USB device error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Scan from network printer by opening web interface
   */
  private async scanFromNetworkPrinter(printer: PrinterDevice): Promise<ScanResult> {
    try {
      // Open printer's web interface in a new tab
      const printerUrl = `http://${printer.ip}`;
      
      if (Capacitor.isNativePlatform()) {
        await Browser.open({ url: printerUrl });
      } else {
        window.open(printerUrl, '_blank');
      }
      
      return {
        success: false,
        error: 'Please use the printer\'s web interface to scan, then upload the file manually.'
      };
    } catch (error) {
      console.error('Network printer access error:', error);
      return {
        success: false,
        error: 'Unable to access printer web interface. Please scan manually and upload the file.'
      };
    }
  }

  /**
   * Scan from native printer using platform-specific APIs
   */
  private async scanFromNativePrinter(printer: PrinterDevice): Promise<ScanResult> {
    try {
      // This would use Capacitor plugins for Brother, HP, Canon, etc. SDKs
      // For now, return instructions for manual scanning
      
      return {
        success: false,
        error: 'Native printer scanning requires manufacturer-specific plugins. Please use camera scan instead.'
      };
    } catch (error) {
      console.error('Native printer scanning error:', error);
      return {
        success: false,
        error: `Native scanning error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
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