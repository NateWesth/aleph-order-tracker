import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.alephorders',
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