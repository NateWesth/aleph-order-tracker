import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.1f9c4513faa54603ad1a944e8d1aa5ea',
  appName: 'aleph-order-tracker',
  webDir: 'dist',
  server: {
    url: 'https://1f9c4513-faa5-4603-ad1a-944e8d1aa5ea.lovableproject.com?forceHideBadge=true',
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