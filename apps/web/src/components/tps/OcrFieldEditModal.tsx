'use client'

/**
 * OcrFieldEditModal — inline edit dialog used by the TPS self-review screen.
 *
 * Replaces the earlier window.prompt() shortcut which was painful on mobile
 * for elderly users. This is a focused bottom-sheet on phone / centered
 * modal on desktop with the correct input control for the field type:
 *
 *   - 'date'    → native <input type="date"> (HTML5 picker)
 *   - 'sex'     → M / F segmented control
 *   - 'text'    → <input type="text">
 *
 * Contract:
 *   - Component is fully controlled by the parent. Parent decides which row
 *     is being edited via `field` (null = closed).
 *   - `onSave(nextValue)` is called with the trimmed new value. Empty
 *     strings are allowed — the parent decides what an empty edit means
 *     (e.g. flips review_required=true).
 *   - Esc and the backdrop click both close without saving.
 *
 * Accessibility:
 *   - role="dialog", aria-modal="true", aria-labelledby on the title.
 *   - The first form control gets autofocus.
 *   - We trap focus naively by only rendering form controls inside the
 *     dialog. A full focus-trap library is overkill for two buttons.
 */

import { useEffect, useRef, useState } from 'react'

export type OcrEditFieldType = 'text' | 'date' | 'sex'
export type OcrEditLocale = 'uk' | 'ru' | 'en' | 'es'

interface Props {
  /** Field key being edited (e.g. 'family_name'). null = closed. */
  field: string | null
  /** Localized human label, e.g. "Фамилия". Only shown when field !== null. */
  label: string
  /** Initial value. Empty string is fine. */
  value: string
  /** Which control to render. */
  inputType: OcrEditFieldType
  /** Locale for button captions. */
  locale: OcrEditLocale
  /** Save handler — gets trimmed value. */
  onSave: (next: string) => void
  /** Close without saving. */
  onClose: () => void
}

const COPY = {
  uk: {
    titlePrefix: 'Виправити',
    cancel: 'Скасувати',
    save: 'Зберегти',
    sexMale: 'Чоловіча',
    sexFemale: 'Жіноча',
    hint: 'Натисніть «Зберегти», щоб оновити поле. Натисніть «Скасувати» — і ваш OCR-значення залишиться.',
  },
  ru: {
    titlePrefix: 'Исправить',
    cancel: 'Отмена',
    save: 'Сохранить',
    sexMale: 'Мужской',
    sexFemale: 'Женский',
    hint: 'Нажмите «Сохранить», чтобы обновить поле. «Отмена» — и значение OCR останется.',
  },
  en: {
    titlePrefix: 'Edit',
    cancel: 'Cancel',
    save: 'Save',
    sexMale: 'Male',
    sexFemale: 'Female',
    hint: 'Press «Save» to update the field. «Cancel» keeps the OCR value.',
  },
  es: {
    titlePrefix: 'Editar',
    cancel: 'Cancelar',
    save: 'Guardar',
    sexMale: 'Masculino',
    sexFemale: 'Femenino',
    hint: 'Pulse «Guardar» para actualizar el campo. «Cancelar» mantiene el valor OCR.',
  },
} as const

export function OcrFieldEditModal(props: Props) {
  const { field, label, value, inputType, locale, onSave, onClose } = props
  const c = COPY[locale]
  const [draft, setDraft] = useState<string>(value)
  const firstControlRef = useRef<HTMLInputElement | HTMLButtonElement | null>(null)

  // Re-seed draft every time we open with a new field. Without this the
  // user could "edit" row A, close without saving, click row B and see
  // row A's stale draft pre-populated.
  useEffect(() => {
    setDraft(value)
  }, [field, value])

  // Close on Escape — modal-grade convenience.
  useEffect(() => {
    if (field === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [field, onClose])

  // Autofocus the first control whenever a new field is opened.
  useEffect(() => {
    if (field === null) return
    const timer = setTimeout(() => firstControlRef.current?.focus?.(), 50)
    return () => clearTimeout(timer)
  }, [field])

  if (field === null) return null

  const handleSave = () => {
    onSave(draft.trim())
  }

  const renderControl = () => {
    if (inputType === 'date') {
      // Native HTML date picker. Value is ISO YYYY-MM-DD; that matches
      // what passport/I-94/EAD modules emit. If the OCR value is junk
      // the input simply renders empty and the user picks fresh.
      return (
        <input
          ref={firstControlRef as React.MutableRefObject<HTMLInputElement>}
          type="date"
          data-testid="ocr-edit-input-date"
          value={isIsoDate(draft) ? draft : ''}
          onChange={(e) => setDraft(e.target.value)}
          style={{
            width: '100%',
            padding: '14px 14px',
            fontSize: 16,
            border: '1px solid var(--border)',
            borderRadius: 10,
            background: 'var(--surface)',
            color: 'var(--text-1)',
            marginBottom: 8,
          }}
        />
      )
    }

    if (inputType === 'sex') {
      // Segmented control. We normalise to a single uppercase letter so
      // downstream consumers don't have to think about 'Male'/'M'/'male'.
      const isM = draft.trim().toUpperCase().startsWith('M')
      const isF = draft.trim().toUpperCase().startsWith('F')
      const btn = (selected: boolean): React.CSSProperties => ({
        flex: 1,
        padding: '14px 8px',
        textAlign: 'center',
        fontSize: 15,
        fontWeight: 700,
        color: selected ? '#fff' : 'var(--text-1)',
        background: selected ? 'var(--success)' : 'var(--surface)',
        border: selected ? '2px solid var(--success)' : '1px solid var(--border)',
        borderRadius: 10,
        cursor: 'pointer',
      })
      return (
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <button
            ref={firstControlRef as React.MutableRefObject<HTMLButtonElement>}
            type="button"
            data-testid="ocr-edit-sex-male"
            onClick={() => setDraft('M')}
            style={btn(isM)}
          >
            {c.sexMale}
          </button>
          <button
            type="button"
            data-testid="ocr-edit-sex-female"
            onClick={() => setDraft('F')}
            style={btn(isF)}
          >
            {c.sexFemale}
          </button>
        </div>
      )
    }

    // Default: text input.
    return (
      <input
        ref={firstControlRef as React.MutableRefObject<HTMLInputElement>}
        type="text"
        data-testid="ocr-edit-input-text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
        style={{
          width: '100%',
          padding: '14px 14px',
          fontSize: 16,
          border: '1px solid var(--border)',
          borderRadius: 10,
          background: 'var(--surface)',
          color: 'var(--text-1)',
          marginBottom: 8,
        }}
      />
    )
  }

  const titleId = 'ocr-edit-title'

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-testid="ocr-edit-modal"
      onClick={(e) => {
        // Backdrop click = close. Don't close when the user clicks inside
        // the inner panel.
        if (e.target === e.currentTarget) onClose()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.55)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 480,
          background: 'var(--background)',
          borderRadius: '16px 16px 0 0',
          padding: '18px 18px 22px',
          boxShadow: '0 -8px 30px rgba(0, 0, 0, 0.25)',
        }}
      >
        <p
          id={titleId}
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: 'var(--text-3)',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            marginBottom: 4,
          }}
        >
          {c.titlePrefix}
        </p>
        <h2
          style={{
            fontSize: 20,
            fontWeight: 800,
            color: 'var(--text-1)',
            marginBottom: 14,
          }}
        >
          {label}
        </h2>

        {renderControl()}

        <p
          style={{
            fontSize: 12,
            color: 'var(--text-3)',
            lineHeight: 1.45,
            marginBottom: 12,
          }}
        >
          {c.hint}
        </p>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            data-testid="ocr-edit-cancel"
            onClick={props.onClose}
            style={{
              flex: 1,
              padding: '14px 16px',
              fontSize: 15,
              fontWeight: 700,
              borderRadius: 12,
              border: '1px solid var(--border)',
              background: 'var(--surface-2)',
              color: 'var(--text-1)',
              cursor: 'pointer',
            }}
          >
            {c.cancel}
          </button>
          <button
            type="button"
            data-testid="ocr-edit-save"
            onClick={handleSave}
            style={{
              flex: 2,
              padding: '14px 18px',
              fontSize: 16,
              fontWeight: 800,
              borderRadius: 12,
              border: 'none',
              background: 'var(--success)',
              color: '#fff',
              cursor: 'pointer',
              boxShadow: '0 3px 14px rgba(22,163,74,0.30)',
            }}
          >
            {c.save}
          </button>
        </div>
      </div>
    </div>
  )
}

/** Whether a string looks like ISO yyyy-mm-dd. Used to decide whether to
 *  hand the value straight to <input type="date">, which silently drops
 *  anything else (and we don't want surprise data loss). */
function isIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s.trim())
}

/**
 * Decide the right input type for a given extracted-field key. Anything
 * that smells like a date goes to the calendar picker; sex gets the
 * segmented control; everything else is plain text.
 */
export function inputTypeForField(field: string): OcrEditFieldType {
  if (
    field === 'dob' ||
    field === 'passport_expiration_date' ||
    field === 'last_entry_date' ||
    field === 'i94_admit_until' ||
    field === 'ead_expiration_date'
  ) {
    return 'date'
  }
  if (field === 'sex') return 'sex'
  return 'text'
}
