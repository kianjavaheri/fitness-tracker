import { registerPlugin } from '@capacitor/core';
import { isNative } from '../native/platform';

type Style = 'light' | 'medium' | 'heavy';

/** ios/App/App/AppHapticsPlugin.swift */
const AppHaptics = registerPlugin<{
  prepare(options: { style?: Style }): Promise<void>;
  impact(options: { style?: Style; x?: number; y?: number }): Promise<void>;
}>('AppHaptics');

const report = (err: unknown) => console.warn('[AppHaptics]', err);

/**
 * A short tap, at the touch point if given. Real haptics in the iPhone app; navigator.vibrate on Android browsers.
 * Safari on iPhone has no way to do it for web pages, so the home-screen web app stays silent.
 */
export function haptic(at?: { x: number; y: number }, style: Style = 'medium') {
  if (isNative) void AppHaptics.impact({ style, ...at }).catch(report);
  else if (typeof navigator.vibrate === 'function') navigator.vibrate(style === 'heavy' ? 20 : 10);
}

/** Two firm taps: something finished (the rest timer running out). */
export function hapticAlert() {
  haptic(undefined, 'heavy');
  setTimeout(() => haptic(undefined, 'heavy'), 180);
}

/** Warms up the haptic engine when a press starts, so a haptic() moments later isn't late or dropped. */
export function prepareHaptic() {
  if (isNative) void AppHaptics.prepare({ style: 'medium' }).catch(report);
}
