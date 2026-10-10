import nativeAuth from './native-auth.json';

// Android emulator: use http://10.0.2.2:5080. Real device: your machine's LAN IP.
// 127.0.0.1 and not localhost: on Windows "localhost" tries IPv6 first, and Docker's IPv6 relay can hang while IPv4 works.
export const environment = {
  production: false,
  apiBaseUrl: 'http://127.0.0.1:5080',
  nativeAuth
};
