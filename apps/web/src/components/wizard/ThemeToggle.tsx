'use client'

import { useEffect } from 'react'
import { Moon, Sun } from 'lucide-react'
import { useWizard } from '@/contexts/WizardContext'

const SS_KEY = 'wizard:theme'

/**
 * Light/dark theme toggle.
 * - Reads/sets `theme` from WizardContext
 * - Applies `data-theme` attribute to `document.documentElement`
 * - Also syncs to sessionStorage key `wizard:theme`
 */
export function ThemeToggle() {
  const { state, setTheme } = useWizard()
  const isDark = state.theme === 'dark'

  // Apply `dark` class to <html> whenever theme changes (Tailwind v4 class strategy)
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
    try {
      sessionStorage.setItem(SS_KEY, state.theme)
    } catch {
      // sessionStorage unavailable — ignore
    }
  }, [state.theme, isDark])

  function handleToggle() {
    setTheme(isDark ? 'light' : 'dark')
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      className="rounded-md p-1.5 transition-colors hover:opacity-80"
      style={{ background: 'var(--surface-2)', color: 'var(--text-2)', border: '1px solid var(--border)' }}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {isDark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  )
}
