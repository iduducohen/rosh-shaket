import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'il.roshshaket.app',
  appName: 'יוצאים בראש שקט',
  webDir: 'www',
  plugins: {
    Camera: { presentationStyle: 'fullscreen' }
  }
};

export default config;
