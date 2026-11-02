import { useSyncExternalStore } from 'react'

const darkQuery = '(prefers-color-scheme: dark)'

function subscribe(onChange: () => void) {
  const query = window.matchMedia(darkQuery)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

const systemIsDark = () => window.matchMedia(darkQuery).matches

/** The theme actually on screen: the user's choice, or the system's when they chose "system". */
export function useResolvedTheme(preference: 'system' | 'light' | 'dark'): 'light' | 'dark' {
  const dark = useSyncExternalStore(subscribe, systemIsDark, () => true)
  if (preference !== 'system') return preference
  return dark ? 'dark' : 'light'
}
