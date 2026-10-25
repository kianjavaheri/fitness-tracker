import { Capacitor } from '@capacitor/core';

/** Running inside the iPhone app (Capacitor), not a browser or the home-screen web app. */
export const isNative = Capacitor.isNativePlatform();

/** The hosted web app. Inside the iPhone app the page's own origin is capacitor://localhost, so links use this. */
export const SITE_URL = 'https://fitness-tracker-cb4cd.web.app';
