import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.alephorders',
  appName: 'Aleph Orders',
  webDir: 'dist',
  // Load from published URL for instant updates without new APK downloads
  server: {
    url: "https://aleph-order-tracker.lovable.app",
    cleartext: true
  },
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
    App: {
      launchShowDuration: 0
    },
    Camera: {
      permissions: ['camera', 'photos']
    }
  }
};

export default config;