import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Device } from '@capacitor/device';

export interface ScanResult {
  success: boolean;
  filePath?: string;
  fileName?: string;
  base64Data?: string;
  error?: string;
}

export interface NativePrintApp {
  id: string;
  name: string;
  packageName?: string;
  url?: string;
  type: 'native' | 'web';
  platform: 'ios' | 'android' | 'web';
  description: string;
}

export class NativePrintScanService {
  private static instance: NativePrintScanService;

  public static getInstance(): NativePrintScanService {
    if (!NativePrintScanService.instance) {
      NativePrintScanService.instance = new NativePrintScanService();
    }
    return NativePrintScanService.instance;
  }

  /**
   * Get available print/scan apps for the current platform
   */
  async getAvailablePrintScanApps(): Promise<NativePrintApp[]> {
    const deviceInfo = await Device.getInfo();
    const apps: NativePrintApp[] = [];

    if (Capacitor.isNativePlatform()) {
      if (deviceInfo.platform === 'ios') {
        apps.push(
          {
            id: 'ios-notes-scanner',
            name: 'Notes Scanner',
            packageName: 'com.apple.mobilenotes',
            type: 'native',
            platform: 'ios',
            description: 'Built-in document scanner in iOS Notes app'
          },
          {
            id: 'ios-files-scanner',
            name: 'Files Scanner',
            packageName: 'com.apple.DocumentsApp',
            type: 'native',
            platform: 'ios',
            description: 'Document scanner in iOS Files app'
          },
          {
            id: 'ios-print-center',
            name: 'AirPrint',
            packageName: 'com.apple.printcenter',
            type: 'native',
            platform: 'ios',
            description: 'iOS native printing service'
          }
        );
      } else if (deviceInfo.platform === 'android') {
        apps.push(
          {
            id: 'android-google-drive',
            name: 'Google Drive Scanner',
            packageName: 'com.google.android.apps.docs',
            type: 'native',
            platform: 'android',
            description: 'Document scanner in Google Drive app'
          },
          {
            id: 'android-files-scanner',
            name: 'Files by Google Scanner',
            packageName: 'com.google.android.apps.nbu.files',
            type: 'native',
            platform: 'android',
            description: 'Document scanner in Files by Google'
          },
          {
            id: 'android-print-service',
            name: 'Android Print Service',
            packageName: 'com.android.printservice.recommendation',
            type: 'native',
            platform: 'android',
            description: 'Android native printing service'
          }
        );
      }
    } else {
      // Web platform apps
      apps.push(
        {
          id: 'web-print-dialog',
          name: 'System Print Dialog',
          url: 'javascript:window.print()',
          type: 'web',
          platform: 'web',
          description: 'Open browser print dialog to access system printers'
        },
        {
          id: 'web-google-drive',
          name: 'Google Drive Scanner',
          url: 'https://drive.google.com/drive/my-drive',
          type: 'web',
          platform: 'web',
          description: 'Use Google Drive web scanner'
        },
        {
          id: 'web-onedrive-scanner',
          name: 'OneDrive Scanner',
          url: 'https://onedrive.live.com',
          type: 'web',
          platform: 'web',
          description: 'Use OneDrive web scanner'
        },
        {
          id: 'web-adobe-scan',
          name: 'Adobe Scan Web',
          url: 'https://acrobat.adobe.com/us/en/mobile/scanner-app.html',
          type: 'web',
          platform: 'web',
          description: 'Adobe online document scanner'
        }
      );
    }

    return apps;
  }

  /**
   * Open native print/scan app
   */
  async openPrintScanApp(app: NativePrintApp): Promise<ScanResult> {
    try {
      if (Capacitor.isNativePlatform() && app.packageName) {
        // Try to open native app
        try {
          await Browser.open({
            url: `${app.packageName}://scan`
          });
          
          return {
            success: true,
            fileName: 'Redirected to native scanner app'
          };
        } catch (error) {
          // If app not installed, provide instructions
          return {
            success: false,
            error: `${app.name} is not installed. Please install it from the app store.`
          };
        }
      } else if (app.url) {
        // Open web app
        if (app.url.startsWith('javascript:')) {
          // Execute JavaScript (for print dialog)
          eval(app.url.replace('javascript:', ''));
          return {
            success: true,
            fileName: 'Opened system print dialog'
          };
        } else {
          // Open in browser
          await Browser.open({
            url: app.url,
            windowName: '_blank',
            toolbarColor: '#ffffff',
            presentationStyle: 'popover'
          });
          
          return {
            success: true,
            fileName: 'Opened scanner in browser'
          };
        }
      }

      return {
        success: false,
        error: 'Unable to open scanning app'
      };
    } catch (error) {
      console.error('Error opening print/scan app:', error);
      return {
        success: false,
        error: `Failed to open ${app.name}: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Get system printing capabilities
   */
  async getSystemPrintCapabilities() {
    const deviceInfo = await Device.getInfo();
    
    if (Capacitor.isNativePlatform()) {
      return {
        hasNativePrint: true,
        hasAirPrint: deviceInfo.platform === 'ios',
        hasGoogleCloudPrint: deviceInfo.platform === 'android',
        hasNativeScanner: true,
        platform: deviceInfo.platform
      };
    } else {
      return {
        hasNativePrint: 'print' in window,
        hasPrintDialog: true,
        hasWebRTC: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
        hasFileAPI: !!(window.File && window.FileReader && window.FileList && window.Blob),
        platform: 'web'
      };
    }
  }

  /**
   * Open system print dialog (web only)
   */
  async openSystemPrintDialog(): Promise<ScanResult> {
    try {
      if (Capacitor.isNativePlatform()) {
        return {
          success: false,
          error: 'System print dialog not available on native platforms'
        };
      }

      window.print();
      return {
        success: true,
        fileName: 'System print dialog opened'
      };
    } catch (error) {
      return {
        success: false,
        error: 'Failed to open system print dialog'
      };
    }
  }

  /**
   * Get recommended scanning method for current platform
   */
  async getRecommendedScanningMethod(): Promise<NativePrintApp | null> {
    const apps = await this.getAvailablePrintScanApps();
    const deviceInfo = await Device.getInfo();

    if (Capacitor.isNativePlatform()) {
      if (deviceInfo.platform === 'ios') {
        return apps.find(app => app.id === 'ios-notes-scanner') || null;
      } else if (deviceInfo.platform === 'android') {
        return apps.find(app => app.id === 'android-google-drive') || null;
      }
    } else {
      return apps.find(app => app.id === 'web-google-drive') || null;
    }

    return null;
  }

  /**
   * Check if specific app is available
   */
  async isAppAvailable(app: NativePrintApp): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) {
      return true; // Web apps are always "available"
    }

    try {
      if (app.packageName) {
        await Browser.open({
          url: `${app.packageName}://`
        });
        return true;
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get scanning instructions for current platform
   */
  async getScanningInstructions(): Promise<string[]> {
    const deviceInfo = await Device.getInfo();
    
    if (Capacitor.isNativePlatform()) {
      if (deviceInfo.platform === 'ios') {
        return [
          '1. Tap "Open Notes Scanner" to use the built-in iOS document scanner',
          '2. Position your document in the camera view',
          '3. Tap the capture button when the document is detected',
          '4. Adjust corners if needed and tap "Save"',
          '5. Return to this app and upload the scanned document'
        ];
      } else if (deviceInfo.platform === 'android') {
        return [
          '1. Tap "Open Google Drive Scanner" to scan with Google Drive',
          '2. Tap the "+" button and select "Scan"',
          '3. Position your document and tap the capture button',
          '4. Adjust and save the scan to Google Drive',
          '5. Return to this app and upload the scanned document'
        ];
      }
    }

    return [
      '1. Use "Open Google Drive Scanner" for online scanning',
      '2. Or use your device camera to capture documents',
      '3. Upload the resulting files to this app',
      '4. Alternatively, use your computer\'s scanning software and upload the files'
    ];
  }
}