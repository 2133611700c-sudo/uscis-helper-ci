'use client'

import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'

/**
 * Standalone light/dark toggle for the main site header.
 * Reads/writes localStorage key `theme` and applies `dark` class to <html>.
 */
export function SiteThemeToggle() {
  const [isDark, setIsDark] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem('theme')
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const dark = stored === 'dark' || (stored === null && prefersDark)
    setIsDark(dark)
    document.documentElement.classList.toggle('dark', dark)
  }, [])

  function toggle() {
    const next = !isDark
    setIsDark(next)
    localStorage.setItem('theme', next ? 'dark' : 'light')
    document.documentElement.classList.toggle('dark', next)
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      style={{
        background: 'var(--surface-2)',
        color: 'var(--text-2)',
        border: '1px solid var(--border)',
      }}
      className="rounded-md p-2.5 min-h-[44px] min-w-[44px] inline-flex items-center justify-center transition-colors hover:opacity-80"
    >
      {isDark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  )
}
