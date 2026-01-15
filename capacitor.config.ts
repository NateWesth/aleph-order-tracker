import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.1f9c4513faa54603ad1a944e8d1aa5ea',
  appName: 'Aleph Orders',
  webDir: 'dist',
  // Remove server config for production - app uses bundled assets
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