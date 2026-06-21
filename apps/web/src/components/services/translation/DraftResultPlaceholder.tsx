import { Download, Mail, RotateCcw } from 'lucide-react'

interface DraftResultPlaceholderProps {
  title: string
  body: string
  draftOnly: string
  downloadLabel: string
  sendToEmailLabel: string
  startAnotherLabel: string
  onReset: () => void
}

export function DraftResultPlaceholder({
  title,
  body,
  draftOnly,
  downloadLabel,
  sendToEmailLabel,
  startAnotherLabel,
  onReset,
}: DraftResultPlaceholderProps) {
  return (
    <div className="rounded-card border border-slate-200 bg-white p-5 shadow-card">
      <div className="space-y-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.08em] text-brand-600">{title}</p>
          <p className="mt-2 text-base leading-relaxed text-ink-700">{body}</p>
        </div>

        <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">{draftOnly}</p>

        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            disabled
            className="inline-flex items-center justify-center gap-2 rounded-btn border border-slate-200 bg-slate-100 px-4 py-3 text-sm font-medium text-ink-600"
          >
            <Download className="h-4 w-4" />
            {downloadLabel}
          </button>
          <button
            type="button"
            disabled
            className="inline-flex items-center justify-center gap-2 rounded-btn border border-slate-200 bg-slate-100 px-4 py-3 text-sm font-medium text-ink-600"
          >
            <Mail className="h-4 w-4" />
            {sendToEmailLabel}
          </button>
        </div>

        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center gap-2 text-sm font-medium text-brand-700 transition-colors hover:text-brand-800"
        >
          <RotateCcw className="h-4 w-4" />
          {startAnotherLabel}
        </button>
      </div>
    </div>
  )
}
