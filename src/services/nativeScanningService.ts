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
   * Attempts to open the HP Smart app for scanning
   */
  async openHPScanApp(): Promise<ScanResult> {
    if (!Capacitor.isNativePlatform()) {
      return {
        success: false,
        error: 'Native scanning is only available on mobile devices'
      };
    }

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
   * Alternative scanning options if HP app is not available
   */
  async openAlternativeScanApp(): Promise<ScanResult> {
    if (!Capacitor.isNativePlatform()) {
      return {
        success: false,
        error: 'Native scanning is only available on mobile devices'
      };
    }

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
   * Checks if HP Smart app is likely available
   */
  async isHPAppAvailable(): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) {
      return false;
    }

    try {
      const platform = Capacitor.getPlatform();
      
      if (platform === 'android') {
        // On Android, we can't directly check if an app is installed
        // We'll try to open it and catch the error
        return true; // Assume available, let the user try
      } else if (platform === 'ios') {
        // On iOS, we can check URL scheme availability
        return true; // Assume available, let the user try
      }
      
      return false;
    } catch (error) {
      return false;
    }
  }
}