import type { CapacitorConfig } from '@capacitor/cli';

// The iPhone app: the same web build (dist/) inside a native shell, which adds haptics, native Google and Apple sign-in, and
// the rest timer on the lock screen. `npm run ios` builds the web app, copies it in and opens Xcode.
// `npm run ios:live` sets LIVE_RELOAD_URL so the app loads from the Vite dev server on this Mac instead (edits show up
// in seconds); the next `npm run ios` puts the bundled web app back, so always use that before archiving.
const liveReloadUrl = process.env.LIVE_RELOAD_URL;

const config: CapacitorConfig = {
  ...(liveReloadUrl ? { server: { url: liveReloadUrl, cleartext: true } } : {}),
  appId: 'com.kianjavaheri.fitnesstracker',
  appName: 'Rerack',
  webDir: 'dist',
  ios: {
    // The page handles the notch and home indicator itself (viewport-fit=cover + env(safe-area-inset-*)).
    contentInset: 'never',
    backgroundColor: '#0f1011',
  },
  plugins: {
    SocialLogin: { providers: { google: true, facebook: false, apple: true, twitter: false } },
    LocalNotifications: { presentationOptions: ['sound', 'banner'] },
  },
};

export default config;
