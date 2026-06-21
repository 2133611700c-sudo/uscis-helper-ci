'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileCheck2,
  Languages,
} from 'lucide-react'
import { translationDocuments, type TranslationDocumentType } from '@/data/translationDocuments'
import { DocumentUploadBox } from '@/components/services/translation/DocumentUploadBox'
import { DraftResultPlaceholder } from '@/components/services/translation/DraftResultPlaceholder'
import { OfficialTranslationSourceBox } from '@/components/services/translation/OfficialTranslationSourceBox'
import { cn } from '@/lib/utils'

const MAX_FILE_BYTES = 10 * 1024 * 1024

function isAcceptedFile(file: File) {
  const n = file.name.toLowerCase()
  return (
    file.type === 'image/jpeg' ||
    file.type === 'image/png' ||
    file.type === 'application/pdf' ||
    file.type === 'image/heic' ||
    file.type === 'image/heif' ||
    n.endsWith('.jpg') ||
    n.endsWith('.jpeg') ||
    n.endsWith('.png') ||
    n.endsWith('.pdf') ||
    n.endsWith('.heic') ||
    n.endsWith('.heif')
  )
}

export function HomeTranslateDocumentWidget() {
  const t = useTranslations('documentTools')
  const ts = useTranslations('translationService')

  const [isOpen, setIsOpen] = useState(true)
  const [selectedDoc, setSelectedDoc] = useState<TranslationDocumentType | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [showResult, setShowResult] = useState(false)

  function resetPanel() {
    setSelectedFile(null)
    setErrorMessage(null)
    setShowResult(false)
  }

  function selectDoc(id: TranslationDocumentType) {
    setSelectedDoc(id)
    resetPanel()
  }

  function handleFileSelect(file: File | null) {
    setShowResult(false)
    if (!file) { setSelectedFile(null); setErrorMessage(null); return }
    if (file.size > MAX_FILE_BYTES) { setSelectedFile(file); setErrorMessage(ts('upload.fileTooLarge')); return }
    if (!isAcceptedFile(file)) { setSelectedFile(file); setErrorMessage(ts('upload.unsupportedType')); return }
    setSelectedFile(file)
    setErrorMessage(null)
  }

  const docContent = selectedDoc
    ? {
        panelTitle: ts(`documents.${selectedDoc}.panelTitle`),
        fieldsIncluded: ts.raw(`documents.${selectedDoc}.fieldsIncluded`) as string[],
        uploadInstructions: ts.raw(`documents.${selectedDoc}.uploadInstructions`) as string[],
        riskNote: ts(`documents.${selectedDoc}.riskNote`),
      }
    : null

  // Build messages object for DocumentTypeCard
  const gridMessages = {
    startAction: ts('startAction'),
    documents: Object.fromEntries(
      translationDocuments.map((doc) => [
        doc.id,
        {
          title: ts(`documents.${doc.id}.title`),
          description: ts(`documents.${doc.id}.description`),
        },
      ]),
    ),
  }

  return (
    <div className="overflow-hidden rounded-[12px] border border-[#dee2e6] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.08)]">
      {/* Accordion toggle */}
      <button
        type="button"
        onClick={() => { setIsOpen(!isOpen); setSelectedDoc(null); resetPanel() }}
        className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-slate-50 md:px-6 md:py-5"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50">
          <Languages className="h-5 w-5 text-brand-600" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xl font-bold text-ink-900 md:text-2xl">{t('title')}</p>
          <p className="mt-0.5 hidden text-sm text-ink-600 sm:block">{t('subtitle')}</p>
        </div>
        <ChevronDown
          className={cn(
            'h-5 w-5 shrink-0 text-ink-600 transition-transform duration-200',
            isOpen && 'rotate-180',
          )}
        />
      </button>

      {isOpen && (
        <div className="border-t border-[#dee2e6] p-5 md:p-6 space-y-6">
          {/* Single-column list — "выпал список колонкой" */}
          <ul className="divide-y divide-[#dee2e6] overflow-hidden rounded-[12px] border border-[#dee2e6]">
            {translationDocuments.map((doc) => {
              const Icon = doc.icon
              const isSelected = selectedDoc === doc.id
              return (
                <li key={doc.id}>
                  <button
                    type="button"
                    onClick={() => selectDoc(doc.id)}
                    className={cn(
                      'flex w-full items-center gap-3 px-5 py-4 text-left transition-colors',
                      isSelected ? 'bg-brand-50' : 'hover:bg-slate-50',
                    )}
                  >
                    <div className={cn(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                      isSelected ? 'bg-brand-100' : 'bg-slate-100',
                    )}>
                      <Icon className={cn('h-4 w-4', isSelected ? 'text-brand-600' : 'text-ink-600')} />
                    </div>
                    <span className={cn(
                      'flex-1 text-sm font-medium',
                      isSelected ? 'font-semibold text-brand-700' : 'text-ink-700',
                    )}>
                      {gridMessages.documents[doc.id].title}
                    </span>
                    {isSelected && <ChevronRight className="h-4 w-4 shrink-0 text-brand-600" />}
                  </button>
                </li>
              )
            })}
          </ul>

          {/* Service panel — appears below grid when doc selected */}
          {selectedDoc && docContent && (
            <div className="rounded-[12px] border border-[#dee2e6] bg-slate-50 p-5 md:p-6 space-y-5">
              {/* Panel header */}
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#dee2e6] pb-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-brand-600">
                    {docContent.panelTitle}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-ink-600">{docContent.riskNote}</p>
                </div>
                <button
                  type="button"
                  onClick={() => { setSelectedDoc(null); resetPanel() }}
                  className="inline-flex items-center gap-2 rounded-full border border-[#dee2e6] bg-white px-4 py-2 text-sm font-medium text-ink-700 transition-colors hover:bg-slate-50"
                >
                  <ArrowLeft className="h-4 w-4" />
                  {ts('panel.useAnotherDocument')}
                </button>
              </div>

              {/* What you get + What to upload */}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-[12px] border border-[#dee2e6] bg-white p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <FileCheck2 className="h-5 w-5 text-brand-600" />
                    <h3 className="text-base font-semibold text-ink-900">{ts('panel.whatYouGet')}</h3>
                  </div>
                  <ul className="space-y-2">
                    {docContent.fieldsIncluded.map((item) => (
                      <li key={item} className="flex items-start gap-2 text-sm leading-relaxed text-ink-700">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-[12px] border border-[#dee2e6] bg-white p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-brand-600" />
                    <h3 className="text-base font-semibold text-ink-900">{ts('panel.whatToUpload')}</h3>
                  </div>
                  <ul className="space-y-2">
                    {docContent.uploadInstructions.map((item) => (
                      <li key={item} className="flex items-start gap-2 text-sm leading-relaxed text-ink-700">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Upload box */}
              <DocumentUploadBox
                messages={{
                  dropText: ts('upload.dropText'),
                  uploadButton: ts('panel.uploadButton'),
                  acceptedTypes: ts('upload.acceptedTypes'),
                  maxSize: ts('upload.maxSize'),
                  privacyNote: ts('upload.privacyNote'),
                  localOnlyNotice: ts('upload.localOnlyNotice'),
                  fileTooLarge: ts('upload.fileTooLarge'),
                  unsupportedType: ts('upload.unsupportedType'),
                  heicWarning: ts('upload.heicWarning'),
                  removeFile: ts('upload.removeFile'),
                }}
                selectedFile={selectedFile}
                onFileSelect={handleFileSelect}
                errorMessage={errorMessage}
              />

              {/* CTA */}
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => { if (selectedFile && !errorMessage) setShowResult(true) }}
                  disabled={!selectedFile || !!errorMessage}
                  className="inline-flex items-center justify-center rounded-[10px] bg-brand-600 px-5 py-3 text-base font-medium text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {ts('panel.createDraftButton')}
                </button>
                <button
                  type="button"
                  onClick={() => { setSelectedDoc(null); resetPanel() }}
                  className="inline-flex items-center justify-center rounded-[10px] border border-[#dee2e6] bg-white px-5 py-3 text-base font-medium text-ink-700 transition-colors hover:bg-slate-50"
                >
                  {ts('panel.useAnotherDocument')}
                </button>
              </div>

              {showResult && (
                <DraftResultPlaceholder
                  title={ts('result.placeholderTitle')}
                  body={ts('result.noBackend')}
                  draftOnly={ts('result.draftOnly')}
                  downloadLabel={ts('result.downloadDraft')}
                  sendToEmailLabel={ts('result.sendToEmail')}
                  startAnotherLabel={ts('result.startAnother')}
                  onReset={resetPanel}
                />
              )}
            </div>
          )}

          {/* Official source — always visible at bottom */}
          <OfficialTranslationSourceBox
            sourceLabel={ts('source.sourceLabel')}
            title={ts('source.title')}
            body={ts('source.body')}
            uscisPolicyManualLabel={ts('source.uscisPolicyManual')}
            ecfrLabel={ts('source.ecfr')}
            lastCheckedLabel={ts('source.lastCheckedLabel', { date: '2026-04-30' })}
          />
        </div>
      )}
    </div>
  )
}
