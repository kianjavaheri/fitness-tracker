import type { CapacitorConfig } from '@capacitor/cli';

// The iPhone app: the same web build (dist/) inside a native shell, which adds haptics, native Google sign-in, and
// the rest timer on the lock screen. `npm run ios` builds the web app, copies it in and opens Xcode.
const config: CapacitorConfig = {
  appId: 'com.kianjavaheri.fitnesstracker',
  appName: 'LiftTrack',
  webDir: 'dist',
  ios: {
    // The page handles the notch and home indicator itself (viewport-fit=cover + env(safe-area-inset-*)).
    contentInset: 'never',
    backgroundColor: '#0f1011',
  },
  plugins: {
    SocialLogin: { providers: { google: true, facebook: false, apple: false, twitter: false } },
    LocalNotifications: { presentationOptions: ['sound', 'banner'] },
  },
};

export default config;
