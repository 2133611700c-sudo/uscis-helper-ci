'use client'

import { MessageCircle } from 'lucide-react'
import { useWizard } from '@/contexts/WizardContext'

/**
 * Floating Action Button for Mia — visible only on mobile (lg:hidden).
 * Positioned above the fixed NavBar (bottom-20).
 */
export function MiaFAB() {
  const { state, setMiaOpen } = useWizard()
  const { miaMessages, miaOpen } = state

  // Show a hint badge when no messages have been exchanged yet
  const showBadge = miaMessages.length === 0

  return (
    <button
      type="button"
      aria-label="Open Mia assistant"
      onClick={() => setMiaOpen(true)}
      className={[
        'fixed bottom-20 right-4 z-40',
        'lg:hidden', // desktop uses DesktopAssistantPanel
        'flex items-center justify-center',
        'w-14 h-14 rounded-full shadow-lg',
        'bg-blue-600 text-white',
        'hover:bg-blue-700 active:scale-95',
        'transition-all duration-150',
        miaOpen ? 'opacity-0 pointer-events-none' : 'opacity-100',
      ].join(' ')}
    >
      <MessageCircle className="w-6 h-6" />

      {showBadge && (
        <span
          aria-hidden="true"
          className={[
            'absolute -top-1 -right-1',
            'flex items-center justify-center',
            'w-5 h-5 rounded-full',
            'bg-red-500 text-white text-xs font-bold',
            'ring-2 ring-white',
          ].join(' ')}
        >
          ?
        </span>
      )}
    </button>
  )
}
