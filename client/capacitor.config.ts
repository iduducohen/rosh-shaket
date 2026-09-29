import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'il.roshshaket.app',
  appName: 'יוצאים בראש שקט',
  webDir: 'www',
  // Android WebView origin https://localhost, iOS capacitor://localhost – both are allowed by the API's CORS.
  android: { allowMixedContent: false },
  plugins: {
    Camera: { presentationStyle: 'fullscreen' }
  }
};

export default config;
