'use client'

import { DocumentTypeCard } from './DocumentTypeCard'
import { translationDocuments, type TranslationDocumentType } from '@/data/translationDocuments'

interface TranslationMessages {
  startAction: string
  documents: Record<string, { title: string; description: string }>
}

interface DocumentTypeGridProps {
  messages: TranslationMessages
  selectedDocument: TranslationDocumentType | null
  onSelect: (value: TranslationDocumentType) => void
}

export function DocumentTypeGrid({
  messages,
  selectedDocument,
  onSelect,
}: DocumentTypeGridProps) {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      {translationDocuments.map((document) => {
        const content = messages.documents[document.id]

        return (
          <DocumentTypeCard
            key={document.id}
            title={content.title}
            description={content.description}
            icon={document.icon}
            isSelected={selectedDocument === document.id}
            onSelect={() => onSelect(document.id)}
            actionLabel={messages.startAction}
          />
        )
      })}
    </div>
  )
}
