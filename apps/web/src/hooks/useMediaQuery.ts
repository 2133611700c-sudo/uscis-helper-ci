'use client'

import { useEffect, useState } from 'react'

/**
 * Track a CSS media query match. Returns false during SSR (mobile-first
 * default — desktop shell upgrades after hydration).
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    const m = window.matchMedia(query)
    setMatches(m.matches)
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches)
    m.addEventListener('change', handler)
    return () => m.removeEventListener('change', handler)
  }, [query])

  return matches
}
