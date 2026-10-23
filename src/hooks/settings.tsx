import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { DEFAULT_SETTINGS, type Settings } from '../core/types';
import { repo } from '../data';
import { useRepoQuery } from './useRepo';

interface SettingsContextValue {
  settings: Settings;
  /** The theme actually applied after resolving "system". */
  resolvedTheme: 'light' | 'dark';
  update: (patch: Partial<Settings>) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

function systemTheme(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const settings = useRepoQuery((r) => r.getSettings()) ?? DEFAULT_SETTINGS;
  const [system, setSystem] = useState(systemTheme);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setSystem(systemTheme());
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const resolvedTheme = settings.theme === 'system' ? system : settings.theme;

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolvedTheme === 'dark' ? '#191919' : '#ffffff');
  }, [resolvedTheme]);

  const update = (patch: Partial<Settings>) => {
    void repo.saveSettings({ ...settings, ...patch });
  };

  return <SettingsContext.Provider value={{ settings, resolvedTheme, update }}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider');
  return ctx;
}
