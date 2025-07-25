import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';

export interface ScanResult {
  success: boolean;
  filePath?: string;
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
   * Attempts to open the HP Smart app for scanning or provides web alternatives
   */
  async openHPScanApp(): Promise<ScanResult> {
    // For native mobile platforms, try to open HP Smart app
    if (Capacitor.isNativePlatform()) {
      return this.openNativeHPApp();
    }
    
    // For web/desktop, provide web-based scanning alternatives
    return this.openWebScanningAlternatives();
  }

  /**
   * Opens HP Smart app on native mobile platforms
   */
  private async openNativeHPApp(): Promise<ScanResult> {

    try {
      // HP Smart app package names/URLs
      const hpAppUrls = {
        android: 'intent://scan#Intent;scheme=hpsmart;package=com.hp.android.printservice;end',
        ios: 'hpsmart://scan' // HP Smart app URL scheme for scanning
      };

      const platform = Capacitor.getPlatform();
      
      if (platform === 'android') {
        // Try to open HP Smart app on Android
        await this.openAndroidApp(hpAppUrls.android);
      } else if (platform === 'ios') {
        // Try to open HP Smart app on iOS
        await this.openIOSApp(hpAppUrls.ios);
      }

      return {
        success: true
      };
    } catch (error) {
      console.error('Error opening HP Smart app:', error);
      return {
        success: false,
        error: 'Could not open HP Smart app. Please ensure it is installed.'
      };
    }
  }

  /**
   * Provides web-based scanning alternatives for desktop/web platforms
   */
  private async openWebScanningAlternatives(): Promise<ScanResult> {
    try {
      // Try to open HP Smart web app first
      const hpWebUrl = 'https://www.hpsmart.com/us/en';
      await Browser.open({ url: hpWebUrl });
      
      return {
        success: true
      };
    } catch (error) {
      console.error('Error opening web scanning alternatives:', error);
      return {
        success: false,
        error: 'Could not open scanning alternatives. Please use the camera or upload features instead.'
      };
    }
  }

  /**
   * Opens an Android app by intent URL
   */
  private async openAndroidApp(intentUrl: string): Promise<void> {
    try {
      // First try to open the app directly with intent
      await Browser.open({ url: intentUrl });
    } catch (error) {
      // If direct opening fails, try the Play Store
      await Browser.open({ 
        url: 'https://play.google.com/store/apps/details?id=com.hp.android.printservice' 
      });
      throw new Error('HP Smart app not installed. Redirected to Play Store.');
    }
  }

  /**
   * Opens an iOS app by URL scheme
   */
  private async openIOSApp(urlScheme: string): Promise<void> {
    try {
      await Browser.open({ url: urlScheme });
    } catch (error) {
      // If URL scheme fails, try App Store
      await Browser.open({ 
        url: 'https://apps.apple.com/app/hp-smart/id469284907' 
      });
      throw new Error('HP Smart app not installed. Redirected to App Store.');
    }
  }

  /**
   * Alternative scanning options for all devices
   */
  async openAlternativeScanApp(): Promise<ScanResult> {
    // For native platforms, try mobile scanning apps
    if (Capacitor.isNativePlatform()) {
      return this.openNativeScanningApps();
    }
    
    // For web/desktop, provide web scanning alternatives
    return this.openWebScanningOptions();
  }

  /**
   * Opens alternative scanning apps on native mobile platforms
   */
  private async openNativeScanningApps(): Promise<ScanResult> {

    try {
      const platform = Capacitor.getPlatform();
      
      if (platform === 'android') {
        // Try common scanning apps on Android
        const scanApps = [
          'intent://scan#Intent;scheme=camscanner;package=com.intsig.camscanner;end',
          'intent://scan#Intent;scheme=adobescan;package=com.adobe.scan.android;end',
          'intent://scan#Intent;scheme=googledrive;package=com.google.android.apps.docs;end',
        ];

        for (const app of scanApps) {
          try {
            await this.openAndroidApp(app);
            return { success: true };
          } catch (error) {
            continue; // Try next app
          }
        }
      } else if (platform === 'ios') {
        // Try common scanning apps on iOS
        const scanApps = [
          'camscanner://scan',
          'adobescan://scan',
          'googledrive://scan',
        ];

        for (const app of scanApps) {
          try {
            await this.openIOSApp(app);
            return { success: true };
          } catch (error) {
            continue; // Try next app
          }
        }
      }

      throw new Error('No scanning apps found');
    } catch (error) {
      return {
        success: false,
        error: 'No compatible scanning apps found on your device'
      };
    }
  }

  /**
   * Provides web-based scanning options for desktop/web platforms
   */
  private async openWebScanningOptions(): Promise<ScanResult> {
    try {
      // List of web-based scanning services
      const webScanServices = [
        'https://www.camscanner.com/user/scan',
        'https://acrobat.adobe.com/us/en/mobile/scanner-app.html',
        'https://www.office.com/launch/lens'
      ];

      // Try the first available service
      await Browser.open({ url: webScanServices[0] });
      
      return {
        success: true
      };
    } catch (error) {
      return {
        success: false,
        error: 'Could not open web scanning services. Please use the camera or upload features instead.'
      };
    }
  }

  /**
   * Checks if HP Smart app is likely available (works for all platforms now)
   */
  async isHPAppAvailable(): Promise<boolean> {
    // Always return true - let the user try regardless of platform
    // The actual availability will be determined when they try to use it
    return true;
  }
}