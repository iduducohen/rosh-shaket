import nativeAuth from './native-auth.json';

// Android emulator: use http://10.0.2.2:5080. Real device: your machine's LAN IP.
export const environment = {
  production: false,
  apiBaseUrl: 'http://localhost:5080',
  nativeAuth
};
