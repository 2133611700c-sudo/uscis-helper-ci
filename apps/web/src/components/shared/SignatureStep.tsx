'use client'
/**
 * SignatureStep — signature choice step for TPS wizard.
 * Shows USCIS rules → user confirms "I've read the rules" →
 * user chooses: sign on screen OR sign on paper.
 * No steering, no recommendations. User decides.
 */
import { useCallback, useState } from 'react'
import SignaturePad from '@/components/shared/SignaturePad'

type Locale = 'uk' | 'ru' | 'en' | 'es'
type Mode = 'screen' | 'paper' | null

interface Props {
  locale: Locale
  onSignature: (data: { mode: 'screen' | 'paper'; dataUrl: string | null }) => void
}

const T: Record<Locale, {
  rulesTitle: string; rule1: string; rule2: string; rule3: string
  ruleLink: string; ruleLinkLabel: string; ruleDate: string
  ack: string; ackLabel: string
  choiceTitle: string
  screenTitle: string; screenDesc: string
  paperTitle: string; paperDesc: string
  confirm: string; back: string
}> = {
  uk: {
    rulesTitle: 'Правила підпису документів USCIS',
    rule1: 'USCIS приймає рукописний підпис або скан/копію рукописного підпису.',
    rule2: 'USCIS не приймає: надруковане ім\'я замість підпису, DocuSign, Adobe Sign.',
    rule3: 'З 10 липня 2026 року USCIS може відхилити заявку з недійсним підписом та утримати збір.',
    ruleLink: 'https://www.uscis.gov/policy-manual/volume-1-part-b-chapter-2',
    ruleLinkLabel: 'Повні правила на сайті USCIS →',
    ruleDate: '8 CFR 103.2(a)(2) • FR doc 2026-09289',
    ack: 'Я ознайомився(-лась) з правилами підпису USCIS',
    ackLabel: 'Підтвердіть що ви прочитали правила',
    choiceTitle: 'Як ви хочете підписати документи?',
    screenTitle: 'Підписати на екрані',
    screenDesc: 'Намалюйте підпис пальцем. Робот вставить його у всі документи. Вам залишиться роздрукувати і відправити.',
    paperTitle: 'Підпишу на папері',
    paperDesc: 'Робот залишить місце для підпису порожнім. Роздрукуйте, підпишіть ручкою, відправте.',
    confirm: 'Продовжити →',
    back: '← Назад',
  },
  ru: {
    rulesTitle: 'Правила подписи документов USCIS',
    rule1: 'USCIS принимает рукописную подпись или скан/копию рукописной подписи.',
    rule2: 'USCIS не принимает: напечатанное имя вместо подписи, DocuSign, Adobe Sign.',
    rule3: 'С 10 июля 2026 года USCIS может отклонить заявку с недействительной подписью и удержать сбор.',
    ruleLink: 'https://www.uscis.gov/policy-manual/volume-1-part-b-chapter-2',
    ruleLinkLabel: 'Полные правила на сайте USCIS →',
    ruleDate: '8 CFR 103.2(a)(2) • FR doc 2026-09289',
    ack: 'Я ознакомился(-лась) с правилами подписи USCIS',
    ackLabel: 'Подтвердите что вы прочитали правила',
    choiceTitle: 'Как вы хотите подписать документы?',
    screenTitle: 'Подписать на экране',
    screenDesc: 'Нарисуйте подпись пальцем. Робот вставит её во все документы. Вам останется распечатать и отправить.',
    paperTitle: 'Подпишу на бумаге',
    paperDesc: 'Робот оставит место для подписи пустым. Распечатайте, подпишите ручкой, отправьте.',
    confirm: 'Продолжить →',
    back: '← Назад',
  },
  en: {
    rulesTitle: 'USCIS Signature Rules',
    rule1: 'USCIS accepts a handwritten signature or a scan/copy of a handwritten signature.',
    rule2: 'USCIS does not accept: typed name instead of signature, DocuSign, Adobe Sign.',
    rule3: 'Starting July 10, 2026, USCIS may deny applications with invalid signatures and keep the filing fee.',
    ruleLink: 'https://www.uscis.gov/policy-manual/volume-1-part-b-chapter-2',
    ruleLinkLabel: 'Full rules on USCIS website →',
    ruleDate: '8 CFR 103.2(a)(2) • FR doc 2026-09289',
    ack: 'I have read the USCIS signature rules',
    ackLabel: 'Confirm you have read the rules',
    choiceTitle: 'How would you like to sign your documents?',
    screenTitle: 'Sign on screen',
    screenDesc: 'Draw your signature with your finger. The system will place it on all documents. Just print and mail.',
    paperTitle: 'I\'ll sign on paper',
    paperDesc: 'The system will leave the signature field blank. Print, sign by hand, mail.',
    confirm: 'Continue →',
    back: '← Back',
  },
  es: {
    rulesTitle: 'Reglas de firma de documentos USCIS',
    rule1: 'USCIS acepta firma manuscrita o escaneo/copia de firma manuscrita.',
    rule2: 'USCIS no acepta: nombre escrito en lugar de firma, DocuSign, Adobe Sign.',
    rule3: 'A partir del 10 de julio de 2026, USCIS puede denegar solicitudes con firma inválida y retener la tarifa.',
    ruleLink: 'https://www.uscis.gov/policy-manual/volume-1-part-b-chapter-2',
    ruleLinkLabel: 'Reglas completas en el sitio de USCIS →',
    ruleDate: '8 CFR 103.2(a)(2) • FR doc 2026-09289',
    ack: 'He leído las reglas de firma de USCIS',
    ackLabel: 'Confirme que ha leído las reglas',
    choiceTitle: '¿Cómo desea firmar sus documentos?',
    screenTitle: 'Firmar en pantalla',
    screenDesc: 'Dibuje su firma con el dedo. El sistema la colocará en todos los documentos. Solo imprima y envíe.',
    paperTitle: 'Firmaré en papel',
    paperDesc: 'El sistema dejará el campo de firma vacío. Imprima, firme a mano, envíe.',
    confirm: 'Continuar →',
    back: '← Atrás',
  },
}

export default function SignatureStep({ locale, onSignature }: Props) {
  const t = T[locale] || T.en
  const [ack, setAck] = useState(false)
  const [mode, setMode] = useState<Mode>(null)
  const [sigData, setSigData] = useState<string | null>(null)

  const handleConfirm = useCallback(() => {
    if (mode === 'paper') {
      onSignature({ mode: 'paper', dataUrl: null })
    } else if (mode === 'screen' && sigData) {
      onSignature({ mode: 'screen', dataUrl: sigData })
    }
  }, [mode, sigData, onSignature])

  const canProceed = mode === 'paper' || (mode === 'screen' && sigData)

  return (
    <div style={{ maxWidth: 600 }}>
      {/* Rules block */}
      <div style={{
        background: 'var(--surface-2, #1a1a2e)',
        border: '1px solid var(--border, #333)',
        borderRadius: 12, padding: 20, marginBottom: 20,
      }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: 'var(--text-1)' }}>
          ℹ️ {t.rulesTitle}
        </div>
        <div style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.6 }}>
          <div style={{ marginBottom: 8 }}>• {t.rule1}</div>
          <div style={{ marginBottom: 8 }}>• {t.rule2}</div>
          <div style={{ marginBottom: 12 }}>• {t.rule3}</div>
        </div>
        <a
          href={t.ruleLink}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'var(--accent, #4ecdc4)', fontSize: 13, textDecoration: 'underline' }}
        >
          {t.ruleLinkLabel}
        </a>
        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6 }}>{t.ruleDate}</div>
      </div>

      {/* Acknowledgment checkbox */}
      <label style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '12px 16px', marginBottom: 20,
        border: ack ? '2px solid var(--accent, #4ecdc4)' : '2px solid var(--border, #444)',
        borderRadius: 10, cursor: 'pointer',
        background: ack ? 'rgba(78,205,196,0.08)' : 'transparent',
        transition: 'all 0.2s',
      }}>
        <input
          type="checkbox"
          checked={ack}
          onChange={(e) => setAck(e.target.checked)}
          style={{ width: 20, height: 20, accentColor: 'var(--accent, #4ecdc4)' }}
        />
        <span style={{ fontSize: 14, color: 'var(--text-1)' }}>{t.ack}</span>
      </label>

      {/* Choice cards — only visible after acknowledgment */}
      {ack && (
        <>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-1)', marginBottom: 12 }}>
            {t.choiceTitle}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Option A: Screen */}
            <button
              type="button"
              onClick={() => setMode('screen')}
              style={{
                textAlign: 'left', padding: 16,
                border: mode === 'screen' ? '2px solid var(--accent, #4ecdc4)' : '2px solid var(--border, #444)',
                borderRadius: 12, cursor: 'pointer',
                background: mode === 'screen' ? 'rgba(78,205,196,0.08)' : 'var(--surface-2, #1a1a2e)',
                transition: 'all 0.2s',
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-1)', marginBottom: 4 }}>
                ✍️ {t.screenTitle}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-3)' }}>{t.screenDesc}</div>
            </button>

            {/* Option B: Paper */}
            <button
              type="button"
              onClick={() => { setMode('paper'); setSigData(null) }}
              style={{
                textAlign: 'left', padding: 16,
                border: mode === 'paper' ? '2px solid var(--accent, #4ecdc4)' : '2px solid var(--border, #444)',
                borderRadius: 12, cursor: 'pointer',
                background: mode === 'paper' ? 'rgba(78,205,196,0.08)' : 'var(--surface-2, #1a1a2e)',
                transition: 'all 0.2s',
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-1)', marginBottom: 4 }}>
                🖨️ {t.paperTitle}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-3)' }}>{t.paperDesc}</div>
            </button>
          </div>

          {/* SignaturePad — only when screen mode selected */}
          {mode === 'screen' && (
            <SignaturePad
              locale={locale}
              onSignatureChange={setSigData}
              height={160}
            />
          )}

          {/* Confirm button */}
          {canProceed && (
            <button
              type="button"
              onClick={handleConfirm}
              style={{
                marginTop: 20, width: '100%', padding: '14px 0',
                fontSize: 16, fontWeight: 600,
                background: 'var(--accent, #4ecdc4)', color: '#000',
                border: 'none', borderRadius: 10, cursor: 'pointer',
              }}
            >
              {t.confirm}
            </button>
          )}
        </>
      )}
    </div>
  )
}
