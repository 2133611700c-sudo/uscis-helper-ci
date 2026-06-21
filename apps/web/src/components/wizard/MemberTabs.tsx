'use client'

import { useWizard } from '@/contexts/WizardContext'

interface MemberTabsProps {
  activeIndex: number
  onChange: (i: number) => void
}

/**
 * Tab bar to switch between family members.
 * Horizontally scrollable on mobile; active tab underlined.
 */
export function MemberTabs({ activeIndex, onChange }: MemberTabsProps) {
  const { state } = useWizard()
  const { members } = state

  return (
    <div
      role="tablist"
      aria-label="Family members"
      className="flex overflow-x-auto gap-1 border-b border-slate-200 mb-4 scrollbar-hide"
    >
      {members.map((member, i) => {
        const isActive = i === activeIndex
        return (
          <button
            key={member.id}
            role="tab"
            type="button"
            aria-selected={isActive}
            aria-controls={`member-panel-${i}`}
            onClick={() => onChange(i)}
            className={[
              'shrink-0 px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors',
              'border-b-2 -mb-px',
              isActive
                ? 'border-blue-600 text-blue-700 dark:text-blue-300'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 hover:border-slate-300',
            ].join(' ')}
          >
            {member.alias}
          </button>
        )
      })}
    </div>
  )
}
