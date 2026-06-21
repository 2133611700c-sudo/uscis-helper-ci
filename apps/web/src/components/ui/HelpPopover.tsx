'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { HelpCircle, X } from 'lucide-react'

/**
 * HelpPopover — info button that opens a modal with rich help content.
 *
 * Pattern lifted from egov.uscis.gov (USWDS `usa-modal--lg`): a small `?`
 * button sits next to a label or term; click opens a centered modal with
 * backdrop, heading, body, and an OK button. The goal is to keep the page
 * surface uncluttered while still making detailed guidance one tap away.
 *
 * Usage:
 *   <HelpPopover triggerLabel="What is a receipt number?" title="Receipt Number Help">
 *     <p>The receipt number is a 13-character identifier...</p>
 *   </HelpPopover>
 *
 * Notes:
 *   - Native <dialog> is used for built-in a11y (focus trap, ESC to close,
 *     backdrop click handling via form method="dialog").
 *   - The trigger renders as a small inline button so it can sit next to a
 *     heading, label, or piece of body text.
 *   - All visible strings (triggerLabel, title, dismissLabel) come from the
 *     consumer so i18n stays in the parent component.
 */

export interface HelpPopoverProps {
  /** Accessible label for the trigger button (aria-label + tooltip). */
  triggerLabel: string
  /** Modal heading (h2). */
  title: string
  /** Modal body — pass any JSX (paragraphs, links, lists). */
  children: ReactNode
  /** Optional label for the close button. Defaults to "OK". */
  dismissLabel?: string
  /** Optional CSS class for the trigger button (e.g. color override). */
  triggerClassName?: string
  /** Optional inline content placed *inside* the trigger button next to the
   *  icon — for the «amber banner» pattern where the trigger doubles as a
   *  short headline. When omitted the trigger is icon-only. */
  triggerContent?: ReactNode
}

export function HelpPopover({
  triggerLabel,
  title,
  children,
  dismissLabel = 'OK',
  triggerClassName,
  triggerContent,
}: HelpPopoverProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [open, setOpen] = useState(false)

  const close = useCallback(() => {
    setOpen(false)
    dialogRef.current?.close()
  }, [])

  // Native <dialog>.showModal() must be called imperatively (cannot be set
  // declaratively via the `open` attribute for modal mode).
  useEffect(() => {
    const d = dialogRef.current
    if (!d) return
    if (open && !d.open) {
      try {
        d.showModal()
      } catch {
        // Already open or not supported — degrade gracefully.
      }
    } else if (!open && d.open) {
      d.close()
    }
  }, [open])

  // Sync state when the user closes via ESC / form submit.
  useEffect(() => {
    const d = dialogRef.current
    if (!d) return
    const onClose = () => setOpen(false)
    d.addEventListener('close', onClose)
    return () => d.removeEventListener('close', onClose)
  }, [])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={triggerLabel}
        title={triggerLabel}
        className={
          triggerClassName ??
          'inline-flex items-center gap-2 text-sm font-semibold text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-full px-3 py-1.5 transition-colors'
        }
      >
        <HelpCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
        {triggerContent ?? <span className="sr-only">{triggerLabel}</span>}
      </button>

      <dialog
        ref={dialogRef}
        // Native <dialog>:modal centering is browser-default, but some
        // Tailwind preflight + custom width rules can break it. Force the
        // canonical fixed-center positioning explicitly so the modal sits
        // in the middle of the viewport regardless of host page styles.
        className="rounded-2xl border border-slate-200 shadow-card-hover p-0 max-w-lg w-[calc(100vw-2rem)] bg-white text-slate-900 backdrop:bg-black/45 fixed inset-0 m-auto h-fit max-h-[90vh] overflow-y-auto"
        onClick={(e) => {
          // Close when clicking outside the inner content (backdrop click).
          if (e.target === dialogRef.current) close()
        }}
      >
        <div className="relative p-6 md:p-7">
          <button
            type="button"
            onClick={close}
            aria-label={dismissLabel}
            className="absolute top-3 right-3 inline-flex items-center justify-center w-9 h-9 rounded-full border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
          <h2 className="text-xl font-bold text-slate-900 mb-3 pr-10">{title}</h2>
          <div className="text-base text-slate-700 leading-relaxed space-y-3">
            {children}
          </div>
          <div className="mt-5">
            <button
              type="button"
              onClick={close}
              className="inline-flex items-center justify-center bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-5 py-2.5 rounded-btn transition-colors"
            >
              {dismissLabel}
            </button>
          </div>
        </div>
      </dialog>
    </>
  )
}
