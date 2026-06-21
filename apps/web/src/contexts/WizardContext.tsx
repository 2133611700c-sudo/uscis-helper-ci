'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { buildLocalStorageKey } from './wizardStorageKey'

// Re-export so existing call sites that import from WizardContext keep working.
export { buildLocalStorageKey }

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FamilyMember = {
  id: string
  alias: string
  docs: Record<string, { storageKey: string; status: 'pending' | 'uploading' | 'done' | 'error' }>
  fields: Record<string, string>
  manualAnswers: Record<string, string>
}

export type WizardState = {
  sessionId: string | null
  anonUserId: string
  step: number
  locale: 'ru' | 'uk' | 'en' | 'es'
  theme: 'light' | 'dark'
  serviceSlug: string
  packageSize: number
  packagePrice: number
  members: FamilyMember[]
  filingMethod: 'mail' | 'online' | 'unsure' | null
  paymentStatus: 'unpaid' | 'paid' | 'mock_paid'
  downloadUrl: string | null
  transferEmail: string | null
  miaOpen: boolean
  miaMessages: Array<{ role: 'user' | 'assistant'; content: string; ts: number }>
}

export type SyncStatus = 'idle' | 'saving' | 'saved' | 'error'

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------

/** Base prices for 1-6 people. Each additional person beyond 6 adds $10. */
const BASE_PRICES = [15, 25, 35, 45, 55, 65] as const

export function calcPrice(size: number): number {
  if (size <= 0) return 0
  if (size <= 6) return BASE_PRICES[size - 1]
  return BASE_PRICES[5] + (size - 6) * 10
}

// ---------------------------------------------------------------------------
// UUID v4
// ---------------------------------------------------------------------------

function uuidV4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

/**
 * Phase 0 multi-service refactor: the localStorage key is now derived from the
 * active serviceSlug so Re-Parole and TPS Ukraine sessions cannot collide.
 *
 *   Re-Parole: wizard:re-parole-u4u:state
 *   TPS:       wizard:tps-ukraine:state
 *
 * Implementation lives in ./wizardStorageKey so unit tests can import it
 * without dragging in this whole JSX module.
 */

type PersistedSlice = {
  sessionId: string | null
  anonUserId: string
  step: number
  locale: WizardState['locale']
  theme: WizardState['theme']
}

function loadPersisted(serviceSlug: string): PersistedSlice | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(buildLocalStorageKey(serviceSlug))
    if (!raw) return null
    return JSON.parse(raw) as PersistedSlice
  } catch {
    return null
  }
}

function savePersisted(serviceSlug: string, slice: PersistedSlice): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(buildLocalStorageKey(serviceSlug), JSON.stringify(slice))
  } catch {
    // quota exceeded or private mode — silently ignore
  }
}

function getSessionIdFromUrl(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const params = new URLSearchParams(window.location.search)
    return params.get('session')
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Default member factory
// ---------------------------------------------------------------------------

const ALIAS_LABEL: Record<WizardState['locale'], string> = {
  uk: 'Особа',
  ru: 'Людина',
  en: 'Person',
  es: 'Persona',
}

function makeMember(index: number, locale: WizardState['locale'] = 'en'): FamilyMember {
  return {
    id: uuidV4(),
    alias: `${ALIAS_LABEL[locale]} ${index + 1}`,
    docs: {},
    fields: {},
    manualAnswers: {},
  }
}

function buildMembers(size: number, existing: FamilyMember[], locale: WizardState['locale'] = 'en'): FamilyMember[] {
  if (size <= 0) return []
  const next: FamilyMember[] = []
  for (let i = 0; i < size; i++) {
    next.push(existing[i] ?? makeMember(i, locale))
  }
  return next
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

function getLocaleFromUrl(): WizardState['locale'] | null {
  if (typeof window === 'undefined') return null
  try {
    const segments = window.location.pathname.split('/').filter(Boolean)
    const first = segments[0] as WizardState['locale']
    const VALID: WizardState['locale'][] = ['uk', 'ru', 'en', 'es']
    // Return null when no valid locale segment found — lets caller fall back to persisted
    return VALID.includes(first) ? first : null
  } catch {
    return null
  }
}

function buildInitialState(serviceSlug: string): WizardState {
  const persisted = loadPersisted(serviceSlug)
  const urlSessionId = getSessionIdFromUrl()
  const urlLocale = getLocaleFromUrl()

  const sessionId = urlSessionId ?? persisted?.sessionId ?? null
  const anonUserId = persisted?.anonUserId ?? uuidV4()
  const step = persisted?.step ?? 0
  // URL locale ALWAYS wins over persisted — /en/ must show English even if localStorage has 'ru'
  const locale = urlLocale ?? persisted?.locale ?? 'en'
  const theme = persisted?.theme ?? 'light'
  const packageSize = 1

  return {
    sessionId,
    anonUserId,
    step,
    locale,
    theme,
    serviceSlug,
    packageSize,
    packagePrice: calcPrice(packageSize),
    members: [makeMember(0, locale)],
    filingMethod: null,
    paymentStatus: 'unpaid',
    downloadUrl: null,
    transferEmail: null,
    miaOpen: false,
    miaMessages: [],
  }
}

// ---------------------------------------------------------------------------
// Session API helpers
// ---------------------------------------------------------------------------

interface SessionApiResponse {
  session_id: string
  id: string
  anon_user_id: string
  locale: string
  service_slug: string
  current_step: number
  state_json: Record<string, unknown>
  created_at: string
}

async function createSession(
  anonUserId: string,
  locale: string,
  serviceSlug: string,
): Promise<string | null> {
  try {
    const res = await fetch('/api/wizard/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locale, service_slug: serviceSlug, anon_user_id: anonUserId }),
    })
    if (!res.ok) return null
    const data: SessionApiResponse = await res.json() as SessionApiResponse
    return data.session_id ?? data.id ?? null
  } catch {
    return null
  }
}

async function fetchSession(sessionId: string): Promise<SessionApiResponse | null> {
  try {
    const res = await fetch(`/api/wizard/session?id=${encodeURIComponent(sessionId)}`)
    if (!res.ok) return null
    return await res.json() as SessionApiResponse
  } catch {
    return null
  }
}

async function patchSession(
  sessionId: string,
  currentStep: number,
  stateJson: Record<string, unknown>,
): Promise<boolean> {
  try {
    const res = await fetch('/api/wizard/session', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, current_step: currentStep, state_json: stateJson }),
    })
    return res.ok
  } catch {
    return false
  }
}

function updateUrlSession(sessionId: string): void {
  if (typeof window === 'undefined') return
  try {
    const url = new URL(window.location.href)
    url.searchParams.set('session', sessionId)
    window.history.replaceState(null, '', url.toString())
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Context value type
// ---------------------------------------------------------------------------

type WizardContextValue = {
  state: WizardState
  syncStatus: SyncStatus
  setStep: (step: number) => void
  setLocale: (locale: WizardState['locale']) => void
  setTheme: (theme: WizardState['theme']) => void
  setPackageSize: (size: number) => void
  setFilingMethod: (method: WizardState['filingMethod']) => void
  setMember: (id: string, patch: Partial<FamilyMember>) => void
  setMiaOpen: (open: boolean) => void
  addMiaMessage: (msg: { role: 'user' | 'assistant'; content: string }) => void
  setPaymentStatus: (status: WizardState['paymentStatus']) => void
  setDownloadUrl: (url: string | null) => void
  setTransferEmail: (email: string | null) => void
}

const WizardContext = createContext<WizardContextValue | null>(null)

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

/**
 * Phase 0 multi-service refactor: WizardProvider now accepts a `serviceSlug`
 * prop so the same context can host both Re-Parole and TPS Ukraine flows
 * without colliding on localStorage or Supabase service_slug.
 *
 * Backward compatibility: when no prop is passed, `serviceSlug` defaults to
 * `'re-parole-u4u'` — this preserves the pre-Phase-0 behaviour for any
 * callers that haven't been updated yet.
 *
 * Acceptance:
 *   - Re-Parole session saves as service_slug=re-parole-u4u
 *   - TPS session saves as service_slug=tps-ukraine
 *   - localStorage keys are namespaced per slug
 *   - no DB migration required (service_slug column already exists)
 */
export interface WizardProviderProps {
  children: ReactNode
  serviceSlug?: string
}

export function WizardProvider({ children, serviceSlug = 're-parole-u4u' }: WizardProviderProps) {
  // serviceSlug is captured at mount time; remounting under a different slug
  // (e.g. navigating between /re-parole-u4u/start and /tps-ukraine/start) gives
  // a fresh state because Next.js unmounts the provider between route trees.
  const [state, setState] = useState<WizardState>(() => buildInitialState(serviceSlug))
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle')
  const patchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(false)

  // On mount: create or hydrate session
  useEffect(() => {
    if (mountedRef.current) return
    mountedRef.current = true

    async function initSession() {
      const currentState = state

      // If we have a sessionId (from URL or localStorage), try to hydrate from API
      if (currentState.sessionId) {
        const remote = await fetchSession(currentState.sessionId)
        if (remote) {
          // Hydrate step from Supabase (authoritative), keep other local state
          setState((s) => ({
            ...s,
            sessionId: remote.session_id ?? remote.id,
            step: remote.current_step ?? s.step,
          }))
          return
        }
        // Hydration failed (session expired/not found) — create new one
      }

      // Create new session under the active serviceSlug
      const newSessionId = await createSession(
        currentState.anonUserId,
        currentState.locale,
        currentState.serviceSlug,
      )
      if (newSessionId) {
        setState((s) => ({ ...s, sessionId: newSessionId }))
        updateUrlSession(newSessionId)
      }
    }

    void initSession()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Persist critical slice to localStorage on every relevant state change.
  // Key is namespaced per serviceSlug so multiple services do not collide.
  useEffect(() => {
    savePersisted(state.serviceSlug, {
      sessionId: state.sessionId,
      anonUserId: state.anonUserId,
      step: state.step,
      locale: state.locale,
      theme: state.theme,
    })
  }, [state.serviceSlug, state.sessionId, state.anonUserId, state.step, state.locale, state.theme])

  // Debounced PATCH to Supabase whenever step or stateJson-relevant fields change
  useEffect(() => {
    if (!state.sessionId) return

    // Clear any pending debounce
    if (patchDebounceRef.current) {
      clearTimeout(patchDebounceRef.current)
    }

    setSyncStatus('saving')

    patchDebounceRef.current = setTimeout(async () => {
      if (!state.sessionId) return

      const stateJson: Record<string, unknown> = {
        packageSize: state.packageSize,
        packagePrice: state.packagePrice,
        filingMethod: state.filingMethod,
        paymentStatus: state.paymentStatus,
        memberCount: state.members.length,
      }

      const ok = await patchSession(state.sessionId, state.step, stateJson)
      setSyncStatus(ok ? 'saved' : 'error')

      // Reset to idle after 2 seconds
      setTimeout(() => setSyncStatus('idle'), 2000)
    }, 500)

    return () => {
      if (patchDebounceRef.current) {
        clearTimeout(patchDebounceRef.current)
      }
    }
  // Only trigger on meaningful state changes, not miaMessages (too noisy)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.step, state.packageSize, state.filingMethod, state.paymentStatus, state.sessionId])

  const setStep = useCallback((step: number) => {
    setState((s) => ({ ...s, step }))
  }, [])

  const setLocale = useCallback((locale: WizardState['locale']) => {
    setState((s) => ({ ...s, locale }))
  }, [])

  const setTheme = useCallback((theme: WizardState['theme']) => {
    setState((s) => ({ ...s, theme }))
  }, [])

  const setPackageSize = useCallback((size: number) => {
    setState((s) => ({
      ...s,
      packageSize: size,
      packagePrice: calcPrice(size),
      members: buildMembers(size, s.members, s.locale),
    }))
  }, [])

  const setFilingMethod = useCallback((method: WizardState['filingMethod']) => {
    setState((s) => ({ ...s, filingMethod: method }))
  }, [])

  const setMember = useCallback((id: string, patch: Partial<FamilyMember>) => {
    setState((s) => ({
      ...s,
      members: s.members.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    }))
  }, [])

  const setMiaOpen = useCallback((open: boolean) => {
    setState((s) => ({ ...s, miaOpen: open }))
  }, [])

  const addMiaMessage = useCallback(
    (msg: { role: 'user' | 'assistant'; content: string }) => {
      setState((s) => ({
        ...s,
        miaMessages: [...s.miaMessages, { ...msg, ts: Date.now() }],
      }))
    },
    [],
  )

  const setPaymentStatus = useCallback((status: WizardState['paymentStatus']) => {
    setState((s) => ({ ...s, paymentStatus: status }))
  }, [])

  const setDownloadUrl = useCallback((url: string | null) => {
    setState((s) => ({ ...s, downloadUrl: url }))
  }, [])

  const setTransferEmail = useCallback((email: string | null) => {
    setState((s) => ({ ...s, transferEmail: email }))
  }, [])

  const value = useMemo<WizardContextValue>(
    () => ({
      state,
      syncStatus,
      setStep,
      setLocale,
      setTheme,
      setPackageSize,
      setFilingMethod,
      setMember,
      setMiaOpen,
      addMiaMessage,
      setPaymentStatus,
      setDownloadUrl,
      setTransferEmail,
    }),
    [
      state,
      syncStatus,
      setStep,
      setLocale,
      setTheme,
      setPackageSize,
      setFilingMethod,
      setMember,
      setMiaOpen,
      addMiaMessage,
      setPaymentStatus,
      setDownloadUrl,
      setTransferEmail,
    ],
  )

  return <WizardContext.Provider value={value}>{children}</WizardContext.Provider>
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useWizard(): WizardContextValue {
  const ctx = useContext(WizardContext)
  if (!ctx) {
    throw new Error('useWizard must be used inside <WizardProvider>')
  }
  return ctx
}
