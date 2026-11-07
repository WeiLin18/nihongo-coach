// Light / dark / follow the system. The choice is stored on this device only.
// index.html runs the same check inline before the first paint, so keep THEME_KEY in step with it.

export type Theme = 'system' | 'light' | 'dark'

const THEME_KEY = 'nihongo-coach-theme'
const media = () => window.matchMedia('(prefers-color-scheme: dark)')

export function getTheme(): Theme {
  try {
    const t = localStorage.getItem(THEME_KEY)
    return t === 'light' || t === 'dark' ? t : 'system'
  } catch {
    return 'system'
  }
}

export function applyTheme(theme = getTheme()) {
  const dark = theme === 'dark' || (theme === 'system' && media().matches)
  document.documentElement.classList.toggle('dark', dark)
}

export function setTheme(theme: Theme) {
  try {
    if (theme === 'system') localStorage.removeItem(THEME_KEY)
    else localStorage.setItem(THEME_KEY, theme)
  } catch {
    // private mode: the choice lasts for this page load
  }
  applyTheme(theme)
}

// Follow the system when it switches (e.g. macOS auto appearance), unless a theme is pinned.
export function watchSystemTheme() {
  media().addEventListener('change', () => applyTheme())
}
