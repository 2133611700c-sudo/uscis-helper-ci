'use client'

/**
 * TranslationLab — Document AI Pipeline Demo
 *
 * 5-step interactive demo:
 *   STEP 1  Select one of 3 synthetic sample documents
 *   STEP 2  Preview the rendered document
 *   STEP 3  AI extraction animation (~1.5 s)
 *   STEP 4  Review table: Field | AI Found | Confidence | Status | Edit
 *   STEP 5  JSON canonical view + 4 download buttons
 */

import { useState, useRef, useCallback } from 'react'
import { SAMPLE_DOCUMENTS, type SampleDocument } from '@/lib/translation/sampleDocuments'
import { runMockOCR, type OCRResult, type OCRField } from '@/lib/translation/mockOCR'
import {
  generateAllLabOutputs,
  downloadLabFile,
} from '@/lib/translation/generateLabOutputs'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type Step = 'select' | 'preview' | 'extracting' | 'review' | 'outputs'

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusBadge({ status, confidence }: { status: OCRField['status']; confidence: number }) {
  const cfg = {
    pass:   { bg: 'bg-green-100',  text: 'text-green-800',  label: 'PASS'   },
    review: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'REVIEW' },
    fail:   { bg: 'bg-red-100',    text: 'text-red-800',    label: 'FAIL'   },
  }[status]
  return (
    <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-bold ${cfg.bg} ${cfg.text}`}>
      {cfg.label} <span className="font-normal opacity-70">{confidence}%</span>
    </span>
  )
}

function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0
  return (
    <div className="flex items-center gap-2 text-xs text-[var(--text-2)]">
      <div className="flex-1 rounded-full bg-[var(--surface-3,#e5e7eb)] h-1.5 overflow-hidden">
        <div
          className="h-full rounded-full bg-blue-500 transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="tabular-nums">{current}/{total}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 1 — Document Selection
// ---------------------------------------------------------------------------
function SelectStep({ onSelect }: { onSelect: (doc: SampleDocument) => void }) {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-[var(--text-1)]">Select a Sample Document</h2>
        <p className="mt-1 text-sm text-[var(--text-2)]">
          Choose one of three synthetic Ukrainian documents to test the AI extraction pipeline.
          All data is fictional — for demo purposes only.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {SAMPLE_DOCUMENTS.map((doc) => (
          <button
            key={doc.id}
            onClick={() => onSelect(doc)}
            className="group flex flex-col items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-5 text-center transition-all hover:border-blue-400 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <div
              className="flex h-14 w-14 items-center justify-center rounded-full text-2xl"
              style={{ backgroundColor: doc.color + '22', border: `2px solid ${doc.color}` }}
            >
              {doc.icon}
            </div>
            <div>
              <div className="font-semibold text-[var(--text-1)]">{doc.titleEn}</div>
              <div className="text-xs text-[var(--text-2)]">{doc.titleUk}</div>
              <div className="mt-2 text-xs text-[var(--text-2)] leading-snug">{doc.descriptionEn}</div>
            </div>
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 group-hover:bg-blue-100">
              Select →
            </span>
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface-2)] p-4 text-center">
        <p className="text-sm text-[var(--text-2)]">
          📎 <span className="font-medium">Upload your own document</span> — coming soon.
          This demo uses pre-loaded synthetic samples.
        </p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 2 — Document Preview
// ---------------------------------------------------------------------------
function PreviewStep({
  doc,
  onRun,
  onBack,
}: {
  doc: SampleDocument
  onRun: () => void
  onBack: () => void
}) {
  const html = doc.renderHtml()
  const blobUrl = useRef<string | null>(null)

  // Create a blob URL once
  if (!blobUrl.current) {
    const blob = new Blob([html], { type: 'text/html' })
    blobUrl.current = URL.createObjectURL(blob)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[var(--text-1)]">
            {doc.icon} {doc.titleEn}
          </h2>
          <p className="text-sm text-[var(--text-2)]">
            Review the document, then run AI extraction to identify all fields.
          </p>
        </div>
        <button
          onClick={onBack}
          className="text-sm text-[var(--text-2)] hover:text-[var(--text-1)] underline underline-offset-2"
        >
          ← Back
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface-2)] px-4 py-2">
          <span className="text-xs font-medium text-[var(--text-2)]">Document Preview</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700 border border-red-200">
            🔒 SAMPLE — NOT AN ORIGINAL
          </span>
        </div>
        <iframe
          src={blobUrl.current}
          title="Document Preview"
          className="w-full"
          style={{ height: '520px', border: 'none' }}
          sandbox="allow-same-origin"
        />
      </div>

      <div className="flex justify-end">
        <button
          onClick={onRun}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 active:bg-blue-800 transition-colors"
        >
          🤖 Run AI Extraction
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 3 — Extracting Animation
// ---------------------------------------------------------------------------
const EXTRACTION_MESSAGES = [
  'Detecting document type…',
  'Locating text regions…',
  'Running OCR on Latin characters…',
  'Running OCR on Cyrillic characters…',
  'Parsing field boundaries…',
  'Applying transliteration rules…',
  'Scoring confidence per field…',
  'Flagging low-confidence values…',
  'Finalizing extraction results…',
]

function ExtractingStep({ messageIndex }: { messageIndex: number }) {
  const msg = EXTRACTION_MESSAGES[Math.min(messageIndex, EXTRACTION_MESSAGES.length - 1)]
  return (
    <div className="flex flex-col items-center justify-center gap-6 py-16">
      <div className="relative flex h-20 w-20 items-center justify-center">
        <div className="absolute inset-0 rounded-full border-4 border-blue-200" />
        <div className="absolute inset-0 rounded-full border-4 border-t-blue-600 animate-spin" />
        <span className="text-2xl">🤖</span>
      </div>
      <div className="text-center">
        <p className="text-base font-semibold text-[var(--text-1)]">AI Extraction in Progress</p>
        <p className="mt-1 text-sm text-[var(--text-2)] transition-all duration-300">{msg}</p>
      </div>
      <div className="w-64">
        <div className="h-1.5 w-full rounded-full bg-[var(--surface-3,#e5e7eb)] overflow-hidden">
          <div
            className="h-full rounded-full bg-blue-500 transition-all duration-200"
            style={{
              width: `${Math.round(((messageIndex + 1) / EXTRACTION_MESSAGES.length) * 100)}%`,
            }}
          />
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 4 — Review Table
// ---------------------------------------------------------------------------
function ReviewStep({
  doc,
  result,
  onFieldChange,
  onConfirm,
  onBack,
}: {
  doc: SampleDocument
  result: OCRResult
  onFieldChange: (key: string, value: string) => void
  onConfirm: () => void
  onBack: () => void
}) {
  const groups: Array<{ label: string; id: OCRField['group'] }> = [
    { label: 'Personal Information', id: 'personal' },
    { label: 'Document Details',     id: 'document' },
    { label: 'Issuing Authority',    id: 'authority' },
  ]

  const blockingCount = result.fields.filter((f) => f.status !== 'pass' && !f.userEdited).length

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-[var(--text-1)]">Review Extraction Results</h2>
          <p className="text-sm text-[var(--text-2)]">
            Verify all REVIEW / FAIL fields before generating the translation.
          </p>
        </div>
        <button
          onClick={onBack}
          className="shrink-0 text-sm text-[var(--text-2)] hover:text-[var(--text-1)] underline underline-offset-2"
        >
          ← Back
        </button>
      </div>

      {/* Summary badges */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2">
          <span className="text-base font-bold text-green-600">{result.passCount}</span>
          <span className="text-xs text-[var(--text-2)]">PASS</span>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2">
          <span className="text-base font-bold text-yellow-600">{result.reviewCount}</span>
          <span className="text-xs text-[var(--text-2)]">REVIEW</span>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2">
          <span className="text-base font-bold text-red-600">{result.failCount}</span>
          <span className="text-xs text-[var(--text-2)]">FAIL</span>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2">
          <span className="text-base font-bold text-[var(--text-1)]">{result.overallConfidence}%</span>
          <span className="text-xs text-[var(--text-2)]">overall</span>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2">
          <span className="text-base font-bold text-[var(--text-1)]">{result.processingMs}ms</span>
          <span className="text-xs text-[var(--text-2)]">processing</span>
        </div>
      </div>

      {/* Per-group field tables */}
      {groups.map(({ label, id }) => {
        const fields = result.fields.filter((f) => f.group === id)
        if (fields.length === 0) return null
        return (
          <div key={id} className="overflow-hidden rounded-xl border border-[var(--border)]">
            <div className="border-b border-[var(--border)] bg-[var(--surface-2)] px-4 py-2.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-2)]">
                {label}
              </span>
            </div>
            <div className="divide-y divide-[var(--border)]">
              {fields.map((field) => (
                <FieldRow
                  key={field.key}
                  field={field}
                  onChange={(v) => onFieldChange(field.key, v)}
                />
              ))}
            </div>
          </div>
        )
      })}

      {/* Confirm button */}
      <div className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">
        {blockingCount > 0 ? (
          <p className="text-sm text-yellow-700">
            ⚠️ {blockingCount} field{blockingCount > 1 ? 's' : ''} still need{blockingCount === 1 ? 's' : ''} review.
            Edit the values above, then confirm.
          </p>
        ) : (
          <p className="text-sm text-green-700">
            ✅ All fields verified. Ready to generate outputs.
          </p>
        )}
        <button
          onClick={onConfirm}
          className="ml-4 shrink-0 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 active:bg-blue-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Generate Files →
        </button>
      </div>
    </div>
  )
}

function FieldRow({
  field,
  onChange,
}: {
  field: OCRField
  onChange: (v: string) => void
}) {
  const needsAttention = field.status !== 'pass' && !field.userEdited
  return (
    <div
      className={`grid grid-cols-1 gap-2 px-4 py-3 sm:grid-cols-[1fr_1fr_auto] sm:items-start ${
        needsAttention ? 'bg-yellow-50/60' : ''
      }`}
    >
      {/* Labels */}
      <div>
        <div className="text-sm font-medium text-[var(--text-1)]">{field.labelEn}</div>
        <div className="text-xs text-[var(--text-2)]">{field.labelUk}</div>
        <div className="mt-1">
          <StatusBadge status={field.status} confidence={field.confidence} />
        </div>
        {field.note && (
          <div className="mt-1 text-xs text-amber-700 leading-snug">⚠ {field.note}</div>
        )}
      </div>

      {/* Edit input */}
      <div className="flex flex-col gap-1">
        <label className="text-xs text-[var(--text-2)]">
          AI extracted: <span className="font-mono text-[var(--text-1)]">{field.aiValue || '—'}</span>
        </label>
        <input
          type="text"
          value={field.editedValue}
          onChange={(e) => onChange(e.target.value)}
          className={`rounded border px-2.5 py-1.5 text-sm font-mono text-[var(--text-1)] bg-[var(--surface-1)] focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            field.userEdited
              ? 'border-green-400'
              : field.status === 'pass'
              ? 'border-[var(--border)]'
              : 'border-yellow-400'
          }`}
          placeholder="Enter correct value…"
        />
      </div>

      {/* Check mark if edited */}
      <div className="flex items-center justify-end sm:pt-6">
        {field.userEdited ? (
          <span className="text-green-600 text-lg" title="Verified by user">✓</span>
        ) : field.status === 'pass' ? (
          <span className="text-green-400 text-lg">✓</span>
        ) : (
          <span className="text-yellow-400 text-lg" title="Needs verification">⚠</span>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 5 — Outputs
// ---------------------------------------------------------------------------
function OutputsStep({
  doc,
  result,
  onReset,
}: {
  doc: SampleDocument
  result: OCRResult
  onReset: () => void
}) {
  const [devViewOpen, setDevViewOpen] = useState(false)

  const fieldValues: Record<string, string> = Object.fromEntries(
    result.fields.map((f) => [f.key, f.editedValue]),
  )

  const outputs = generateAllLabOutputs(doc, result, 'Ukrainian')

  const downloads = [
    {
      label: 'Translation Draft',
      filename: 'translation-draft.html',
      icon: '📄',
      description: 'USCIS-ready translation draft per 8 CFR 103.2(b)(3) — you sign the self-certification',
      content: outputs.translationDraft,
    },
    {
      label: 'Field Review Checklist',
      filename: 'field-review-checklist.html',
      icon: '✅',
      description: 'AI confidence scores, extracted vs. corrected values',
      content: outputs.reviewChecklist,
    },
    {
      label: 'Certification Statement',
      filename: 'certification-statement.html',
      icon: '🖊',
      description: 'Self-certification template — print, complete, and sign',
      content: outputs.certificationStatement,
    },
    {
      label: 'Filing Instructions',
      filename: 'filing-instructions.html',
      icon: '📋',
      description: 'Step-by-step guide for submitting to USCIS',
      content: outputs.filingInstructions,
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-[var(--text-1)]">
            ✅ All 4 Output Files Generated
          </h2>
          <p className="text-sm text-[var(--text-2)]">
            Click any file to open it in the browser. Use File → Print → Save as PDF for a
            print-ready version.
          </p>
        </div>
        <button
          onClick={onReset}
          className="shrink-0 text-sm text-[var(--text-2)] hover:text-[var(--text-1)] underline underline-offset-2"
        >
          ↺ Start Over
        </button>
      </div>

      {/* Download cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        {downloads.map((d) => (
          <div
            key={d.filename}
            className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4"
          >
            <div className="flex items-start gap-3">
              <span className="text-2xl">{d.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-[var(--text-1)]">{d.label}</div>
                <div className="text-xs text-[var(--text-2)] leading-snug">{d.description}</div>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  const blob = new Blob([d.content], { type: 'text/html' })
                  const url = URL.createObjectURL(blob)
                  window.open(url, '_blank')
                }}
                className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1.5 text-xs font-medium text-[var(--text-1)] hover:bg-[var(--surface-3,#e5e7eb)] transition-colors"
              >
                🔍 Preview
              </button>
              <button
                onClick={() => downloadLabFile(d.content, d.filename)}
                className="flex-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition-colors"
              >
                ⬇ Download
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Developer view */}
      <div className="rounded-xl border border-[var(--border)] overflow-hidden">
        <button
          onClick={() => setDevViewOpen((v) => !v)}
          className="flex w-full items-center justify-between bg-[var(--surface-2)] px-4 py-3 text-sm font-medium text-[var(--text-1)] hover:bg-[var(--surface-3,#e5e7eb)] transition-colors"
        >
          <span>{'</>'} Developer View — Canonical JSON</span>
          <span className="text-[var(--text-2)]">{devViewOpen ? '▲' : '▼'}</span>
        </button>
        {devViewOpen && (
          <div className="bg-[#1e1e2e] p-4 overflow-x-auto">
            <pre className="text-xs leading-relaxed text-[#cdd6f4]">
              {JSON.stringify(
                {
                  pipeline: 'translation-lab-v1',
                  document: {
                    id: doc.id,
                    titleEn: doc.titleEn,
                    sourceLanguage: 'Ukrainian',
                    prodId: doc.prodId,
                  },
                  extraction: {
                    processingMs: result.processingMs,
                    overallConfidence: result.overallConfidence,
                    passCount: result.passCount,
                    reviewCount: result.reviewCount,
                    failCount: result.failCount,
                  },
                  fields: result.fields.map((f) => ({
                    key: f.key,
                    labelEn: f.labelEn,
                    aiValue: f.aiValue,
                    editedValue: f.editedValue,
                    userEdited: f.userEdited,
                    confidence: f.confidence,
                    status: f.status,
                    group: f.group,
                  })),
                  fieldValues,
                  generatedAt: new Date().toISOString(),
                },
                null,
                2,
              )}
            </pre>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main TranslationLab component
// ---------------------------------------------------------------------------
export function TranslationLab() {
  const [step, setStep] = useState<Step>('select')
  const [selectedDoc, setSelectedDoc] = useState<SampleDocument | null>(null)
  const [ocrResult, setOcrResult] = useState<OCRResult | null>(null)
  const [extractMsgIdx, setExtractMsgIdx] = useState(0)

  // ── Step 1 → 2: Select document ──
  const handleSelect = useCallback((doc: SampleDocument) => {
    setSelectedDoc(doc)
    setStep('preview')
  }, [])

  // ── Step 2 → 3 → 4: Run OCR ──
  const handleRunExtraction = useCallback(async () => {
    if (!selectedDoc) return
    setStep('extracting')
    setExtractMsgIdx(0)

    // Advance the progress message every ~170ms during the ~1600ms OCR simulation
    const interval = setInterval(() => {
      setExtractMsgIdx((i) => Math.min(i + 1, EXTRACTION_MESSAGES.length - 1))
    }, 170)

    const result = await runMockOCR(selectedDoc.id)
    clearInterval(interval)
    setOcrResult(result)
    setStep('review')
  }, [selectedDoc])

  // ── Step 4: Field edit ──
  const handleFieldChange = useCallback((key: string, value: string) => {
    setOcrResult((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        fields: prev.fields.map((f) =>
          f.key === key ? { ...f, editedValue: value, userEdited: true, status: 'pass' } : f,
        ),
        passCount: prev.fields.filter(
          (f) => f.key === key ? true : f.status === 'pass',
        ).length,
        reviewCount: prev.fields.filter(
          (f) => f.key === key ? false : f.status === 'review',
        ).length,
        failCount: prev.fields.filter(
          (f) => f.key === key ? false : f.status === 'fail',
        ).length,
      }
    })
  }, [])

  // ── Step 4 → 5: Confirm ──
  const handleConfirm = useCallback(() => {
    setStep('outputs')
  }, [])

  // ── Reset ──
  const handleReset = useCallback(() => {
    setSelectedDoc(null)
    setOcrResult(null)
    setExtractMsgIdx(0)
    setStep('select')
  }, [])

  // ── Step indicators ──
  const STEPS: Array<{ id: Step; label: string }> = [
    { id: 'select',     label: 'Select' },
    { id: 'preview',    label: 'Preview' },
    { id: 'extracting', label: 'Extract' },
    { id: 'review',     label: 'Review' },
    { id: 'outputs',    label: 'Download' },
  ]
  const currentIdx = STEPS.findIndex((s) => s.id === step)

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-1)]">
        <div className="flex">
          {STEPS.map((s, i) => {
            const isActive   = s.id === step
            const isPast     = i < currentIdx
            const isFuture   = i > currentIdx
            return (
              <div
                key={s.id}
                className={`flex flex-1 flex-col items-center gap-1 py-3 px-1 text-center border-b-2 transition-colors ${
                  isActive
                    ? 'border-blue-500 text-blue-600'
                    : isPast
                    ? 'border-green-400 text-green-600'
                    : 'border-transparent text-[var(--text-2)]'
                } ${isFuture ? 'opacity-40' : ''}`}
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold
                  border-2
                  ${isActive ? 'border-blue-500 bg-blue-50 text-blue-700' :
                    isPast   ? 'border-green-400 bg-green-50 text-green-700' :
                               'border-[var(--border)] text-[var(--text-2)]'}
                ">
                  {isPast ? '✓' : i + 1}
                </span>
                <span className="hidden text-xs font-medium sm:block">{s.label}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Step content */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-5 sm:p-6">
        {step === 'select' && (
          <SelectStep onSelect={handleSelect} />
        )}

        {step === 'preview' && selectedDoc && (
          <PreviewStep
            doc={selectedDoc}
            onRun={handleRunExtraction}
            onBack={handleReset}
          />
        )}

        {step === 'extracting' && (
          <ExtractingStep messageIndex={extractMsgIdx} />
        )}

        {step === 'review' && selectedDoc && ocrResult && (
          <ReviewStep
            doc={selectedDoc}
            result={ocrResult}
            onFieldChange={handleFieldChange}
            onConfirm={handleConfirm}
            onBack={() => setStep('preview')}
          />
        )}

        {step === 'outputs' && selectedDoc && ocrResult && (
          <OutputsStep
            doc={selectedDoc}
            result={ocrResult}
            onReset={handleReset}
          />
        )}
      </div>

      {/* Pipeline overview (always visible) */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-2)] mb-2">
          Pipeline
        </p>
        <div className="flex flex-wrap items-center gap-1 text-xs text-[var(--text-2)]">
          {[
            '📄 Document',
            '→',
            '🤖 AI / OCR',
            '→',
            '🔍 Field Review',
            '→',
            '📑 Canonical JSON',
            '→',
            '📥 4 Output Files',
          ].map((item, i) => (
            <span
              key={i}
              className={item === '→' ? 'text-[var(--text-2)] mx-0.5' : 'font-medium text-[var(--text-1)]'}
            >
              {item}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
