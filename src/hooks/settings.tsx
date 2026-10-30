import { StatusBar, Style } from '@capacitor/status-bar';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { DEFAULT_SETTINGS, type Settings, type ThemePreference } from '../core/types';
import { repo } from '../data';
import { isNative } from '../native/platform';
import { useRepoQuery } from './useRepo';

interface SettingsContextValue {
  settings: Settings;
  /** The saved settings have loaded (until then `settings` is the defaults). */
  ready: boolean;
  /** The theme actually applied after resolving "system". */
  resolvedTheme: 'light' | 'dark';
  update: (patch: Partial<Settings>) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

/**
 * The theme choice, also kept on this device so the very first frame (index.html's loader, before any code runs) and
 * the moments before saved settings load use it, not the phone's light/dark setting.
 */
const THEME_KEY = 'lifttrack:theme';
function storedTheme(): ThemePreference {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

function systemTheme(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const loaded = useRepoQuery((r) => r.getSettings());
  const settings = loaded ?? { ...DEFAULT_SETTINGS, theme: storedTheme() };
  const [system, setSystem] = useState(systemTheme);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setSystem(systemTheme());
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const resolvedTheme = settings.theme === 'system' ? system : settings.theme;

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(THEME_KEY, loaded.theme);
    } catch {
      // Private mode etc.: the first frame just follows the phone's setting.
    }
  }, [loaded?.theme]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    if (isNative) void StatusBar.setStyle({ style: resolvedTheme === 'dark' ? Style.Dark : Style.Light }).catch(() => {});
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolvedTheme === 'dark' ? '#0f1011' : '#f2f1f6');
  }, [resolvedTheme]);

  // Merged into the latest saved settings, not this render's copy (which is the defaults before the first load).
  const update = (patch: Partial<Settings>) => {
    void repo.getSettings().then((current) => repo.saveSettings({ ...current, ...patch }));
  };

  return <SettingsContext.Provider value={{ settings, ready: !!loaded, resolvedTheme, update }}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider');
  return ctx;
}
