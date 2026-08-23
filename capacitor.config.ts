import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.criblo.fieldapp',
  appName: 'CRI-BLO',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: true,
  },
  android: {
    buildOptions: {
      keystorePath: undefined,
      keystoreAlias: undefined,
    },
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 3000,
      backgroundColor: '#FF7900',
      showSpinner: true,
      spinnerColor: '#ffffff',
    },
    Camera: {
      permissions: ['camera'],
    },
    Geolocation: {
      permissions: ['location'],
    },
  },
};

export default config;