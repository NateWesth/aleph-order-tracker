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