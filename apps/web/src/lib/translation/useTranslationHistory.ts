/**
 * Stage 13D: Translation order history
 *
 * Stores up to MAX_ENTRIES recent translations in localStorage.
 * Each entry contains enough data to regenerate the 4-file download
 * without the user re-filling any fields.
 *
 * Key: "translation_history_v1"
 */

'use client'

import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'translation_history_v1'
const MAX_ENTRIES = 5

export interface TranslationHistoryEntry {
  id: string               // unique: timestamp + docId
  docId: string
  docLabel: string         // localized label at save time (e.g. "Passport")
  srcLang: string
  targetLang: string
  docEra: string | null
  fieldValues: Record<string, string>
  savedAt: string          // ISO date string
}

function readStorage(): TranslationHistoryEntry[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as TranslationHistoryEntry[]) : []
  } catch {
    return []
  }
}

function writeStorage(entries: TranslationHistoryEntry[]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  } catch {
    // QuotaExceededError — ignore silently
  }
}

export function useTranslationHistory() {
  const [history, setHistory] = useState<TranslationHistoryEntry[]>([])

  // Hydrate from localStorage once on mount
  useEffect(() => {
    setHistory(readStorage())
  }, [])

  const saveEntry = useCallback(
    (entry: Omit<TranslationHistoryEntry, 'id' | 'savedAt'>) => {
      const newEntry: TranslationHistoryEntry = {
        ...entry,
        id: `${Date.now()}-${entry.docId}`,
        savedAt: new Date().toISOString(),
      }
      setHistory((prev) => {
        // De-duplicate: drop any existing entry with same docId + srcLang combo
        const filtered = prev.filter(
          (e) => !(e.docId === entry.docId && e.srcLang === entry.srcLang),
        )
        const updated = [newEntry, ...filtered].slice(0, MAX_ENTRIES)
        writeStorage(updated)
        return updated
      })
    },
    [],
  )

  const removeEntry = useCallback((id: string) => {
    setHistory((prev) => {
      const updated = prev.filter((e) => e.id !== id)
      writeStorage(updated)
      return updated
    })
  }, [])

  const clearHistory = useCallback(() => {
    writeStorage([])
    setHistory([])
  }, [])

  return { history, saveEntry, removeEntry, clearHistory }
}
