'use client'

import { useId, type ChangeEvent } from 'react'
import { Upload, X } from 'lucide-react'

interface TranslationUploadMessages {
  dropText: string
  uploadButton: string
  acceptedTypes: string
  maxSize: string
  privacyNote: string
  localOnlyNotice: string
  fileTooLarge: string
  unsupportedType: string
  heicWarning: string
  removeFile: string
}

interface DocumentUploadBoxProps {
  messages: TranslationUploadMessages
  selectedFile: File | null
  onFileSelect: (file: File | null) => void
  errorMessage: string | null
}

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function DocumentUploadBox({
  messages,
  selectedFile,
  onFileSelect,
  errorMessage,
}: DocumentUploadBoxProps) {
  const inputId = useId()

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null
    onFileSelect(file)
  }

  const lowerName = selectedFile?.name.toLowerCase() ?? ''
  const isHeicFile = lowerName.endsWith('.heic') || lowerName.endsWith('.heif')

  return (
    <div className="space-y-4">
      <label
        htmlFor={inputId}
        className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-card border border-dashed border-slate-300 bg-slate-50 px-6 py-8 text-center transition-colors hover:border-brand-300 hover:bg-brand-50"
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-card">
          <Upload className="h-6 w-6 text-brand-600" />
        </div>
        <div className="space-y-1">
          <p className="text-base font-semibold text-ink-900">{messages.dropText}</p>
          <span className="inline-flex rounded-full bg-white px-4 py-2 text-sm font-medium text-brand-700 shadow-sm">
            {messages.uploadButton}
          </span>
          <p className="text-sm text-ink-600">{messages.acceptedTypes}</p>
          <p className="text-sm text-ink-600">{messages.maxSize}</p>
        </div>
      </label>
      <input
        id={inputId}
        type="file"
        accept=".jpg,.jpeg,.png,.pdf,.heic,.heif,image/jpeg,image/png,application/pdf,image/heic,image/heif"
        className="sr-only"
        onChange={handleFileChange}
      />

      {selectedFile && (
        <div className="rounded-card border border-slate-200 bg-white p-4 shadow-card">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink-900">{selectedFile.name}</p>
              <p className="mt-1 text-sm text-ink-600">{formatSize(selectedFile.size)}</p>
            </div>
            <button
              type="button"
              onClick={() => onFileSelect(null)}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 text-ink-600 transition-colors hover:border-slate-300 hover:text-ink-700"
              aria-label={messages.removeFile}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {isHeicFile && (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{messages.heicWarning}</p>
          )}
          {errorMessage && (
            <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</p>
          )}
        </div>
      )}

      <div className="space-y-2 rounded-card border border-slate-200 bg-white p-4 shadow-card">
        <p className="text-sm text-ink-700">{messages.privacyNote}</p>
        <p className="text-sm font-medium text-ink-600">{messages.localOnlyNotice}</p>
      </div>
    </div>
  )
}
