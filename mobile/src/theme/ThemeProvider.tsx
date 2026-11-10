import React, { createContext, useContext } from 'react';
import { useColorScheme } from 'react-native';
import { useStore } from '../store/AppStore';
import { dark, light, Palette } from './theme';

const Ctx = createContext<{ c: Palette; isDark: boolean }>({ c: light, isDark: false });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const { settings } = useStore();
  const isDark = settings.theme === 'dark' || (settings.theme === 'system' && system === 'dark');
  return <Ctx.Provider value={{ c: isDark ? dark : light, isDark }}>{children}</Ctx.Provider>;
}

export function useTheme() {
  return useContext(Ctx);
}
