import { useColorScheme } from 'react-native';
import { useSyncExternalStore } from 'react';
import colors from '@/constants/colors';

type AppScheme = 'light' | 'dark' | null;
let appScheme: AppScheme = null;
const listeners = new Set<() => void>();

export function setAppColorScheme(scheme: AppScheme) {
  appScheme = scheme;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Returns the design tokens for the current color scheme.
 *
 * The returned object contains all color tokens for the active palette
 * plus scheme-independent values like `radius`.
 *
 * Falls back to the light palette when no dark key is defined in
 * constants/colors.ts (the scaffold ships light-only by default).
 * When a sibling web artifact's dark tokens are synced into a `dark`
 * key, this hook will automatically switch palettes based on the
 * device's appearance setting.
 */
export function useColors() {
  const deviceScheme = useColorScheme();
  const preferredScheme = useSyncExternalStore(
    subscribe,
    () => appScheme,
    () => null,
  );
  const scheme = preferredScheme ?? deviceScheme;
  const palette =
    scheme === 'dark' && 'dark' in colors
      ? (colors as unknown as { dark: typeof colors.light }).dark
      : colors.light;
  return { ...palette, radius: colors.radius };
}
