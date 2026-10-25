import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { isNative } from '../native/platform';

/**
 * A light tap. Real haptics in the iPhone app; navigator.vibrate on Android browsers. Safari on iPhone has no way to
 * do it for web pages, so the home-screen web app stays silent.
 */
export function haptic() {
  if (isNative) void Haptics.impact({ style: ImpactStyle.Light });
  else if (typeof navigator.vibrate === 'function') navigator.vibrate(10);
}
