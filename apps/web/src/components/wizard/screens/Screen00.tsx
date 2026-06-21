'use client'

import { useState } from 'react'
import { useWizard } from '@/contexts/WizardContext'

// ---------------------------------------------------------------------------
// Stage 8L — Path selector: 4 options on Screen00
// ---------------------------------------------------------------------------

const T = {
  uk: {
    welcomeBack: 'Ласкаво просимо назад!',
    welcomeBackDesc: 'У вас є незавершена заявка. Продовжити з того місця?',
    continueBtn: (step: number) => `Продовжити (крок ${step})`,
    startOver: 'Почати знову',
    heading: 'Що вам потрібно?',
    paths: [
      {
        key: 'packet',
        icon: '📦',
        title: 'Re-Parole пакет',
        desc: 'Підготувати Form I-131 для продовження parole',
        cta: 'Почати →',
        accent: true,
      },
      {
        key: 'status',
        icon: '🔍',
        title: 'Статус справи',
        desc: 'Перевірити стан вже поданих документів за номером квитанції',
        cta: 'Перевірити →',
        accent: false,
      },
      {
        key: 'translate',
        icon: '📄',
        title: 'Переклад документа',
        desc: 'Підготувати чернетку перекладу документів для USCIS',
        cta: 'Перекласти →',
        accent: false,
      },
      {
        key: 'unsure',
        icon: '🤔',
        title: 'Не впевнений',
        desc: 'Не знаю, що вибрати — покажіть підказку',
        cta: 'Що обрати? →',
        accent: false,
      },
    ],
    unsureTitle: 'Як обрати шлях?',
    unsureCards: [
      {
        icon: '📦',
        title: 'Обирайте "Re-Parole пакет", якщо...',
        items: [
          'Термін вашого parole (U4U) закінчується',
          'Хочете продовжити право перебування у США',
          'Потрібна Form I-131 заповнена та готова до подачі',
        ],
      },
      {
        icon: '🔍',
        title: 'Обирайте "Статус справи", якщо...',
        items: [
          'Ви вже подали I-131 і маєте номер квитанції',
          'Хочете дізнатись, що означає поточний статус',
          'Отримали лист від USCIS і потрібне пояснення',
        ],
      },
      {
        icon: '📄',
        title: 'Обирайте "Переклад", якщо...',
        items: [
          'Є документи не англійською (паспорт, свідоцтво)',
          'USCIS вимагає переклад англійською для документів іншою мовою',
          'Потрібна чернетка перекладу для підготовки пакету',
        ],
      },
    ],
    unsureBackBtn: '← Назад до вибору',
    legalNote: 'Не юридична фірма · Ви подаєте самостійно до USCIS',
  },
  ru: {
    welcomeBack: 'Добро пожаловать назад!',
    welcomeBackDesc: 'У вас есть незавершённая заявка. Продолжить с того места?',
    continueBtn: (step: number) => `Продолжить (шаг ${step})`,
    startOver: 'Начать заново',
    heading: 'Что вам нужно?',
    paths: [
      {
        key: 'packet',
        icon: '📦',
        title: 'Re-Parole пакет',
        desc: 'Подготовить Form I-131 для продления parole',
        cta: 'Начать →',
        accent: true,
      },
      {
        key: 'status',
        icon: '🔍',
        title: 'Статус дела',
        desc: 'Проверить состояние уже поданных документов по номеру квитанции',
        cta: 'Проверить →',
        accent: false,
      },
      {
        key: 'translate',
        icon: '📄',
        title: 'Перевод документа',
        desc: 'Подготовить черновик перевода документов для USCIS',
        cta: 'Перевести →',
        accent: false,
      },
      {
        key: 'unsure',
        icon: '🤔',
        title: 'Не уверен',
        desc: 'Не знаю, что выбрать — покажите подсказку',
        cta: 'Что выбрать? →',
        accent: false,
      },
    ],
    unsureTitle: 'Как выбрать путь?',
    unsureCards: [
      {
        icon: '📦',
        title: 'Выберите "Re-Parole пакет", если...',
        items: [
          'Срок вашего parole (U4U) заканчивается',
          'Хотите продлить право пребывания в США',
          'Нужна заполненная Form I-131 готовая к подаче',
        ],
      },
      {
        icon: '🔍',
        title: 'Выберите "Статус дела", если...',
        items: [
          'Вы уже подали I-131 и есть номер квитанции',
          'Хотите узнать, что означает текущий статус',
          'Получили письмо от USCIS и нужно объяснение',
        ],
      },
      {
        icon: '📄',
        title: 'Выберите "Перевод", если...',
        items: [
          'Есть документы не на английском (паспорт, свидетельство)',
          'USCIS требует полный перевод на английский для иноязычных документов',
          'Нужен черновик перевода для подготовки пакета',
        ],
      },
    ],
    unsureBackBtn: '← Назад к выбору',
    legalNote: 'Не юридическая фирма · Вы подаёте самостоятельно в USCIS',
  },
  en: {
    welcomeBack: 'Welcome back!',
    welcomeBackDesc: 'You have an unfinished application. Continue where you left off?',
    continueBtn: (step: number) => `Continue (Step ${step})`,
    startOver: 'Start over',
    heading: 'What do you need?',
    paths: [
      {
        key: 'packet',
        icon: '📦',
        title: 'Re-Parole Packet',
        desc: 'Prepare Form I-131 to extend your parole status',
        cta: 'Start →',
        accent: true,
      },
      {
        key: 'status',
        icon: '🔍',
        title: 'Case Status',
        desc: 'Check the status of already filed documents by receipt number',
        cta: 'Check →',
        accent: false,
      },
      {
        key: 'translate',
        icon: '📄',
        title: 'Translate Document',
        desc: 'Prepare a translation draft of documents for USCIS',
        cta: 'Translate →',
        accent: false,
      },
      {
        key: 'unsure',
        icon: '🤔',
        title: 'Not Sure',
        desc: "I don't know what to choose — show me a hint",
        cta: 'Help me choose →',
        accent: false,
      },
    ],
    unsureTitle: 'How to choose?',
    unsureCards: [
      {
        icon: '📦',
        title: 'Choose "Re-Parole Packet" if...',
        items: [
          'Your U4U parole is expiring soon',
          'You want to extend your right to stay in the US',
          'You need a completed Form I-131 ready to submit',
        ],
      },
      {
        icon: '🔍',
        title: 'Choose "Case Status" if...',
        items: [
          'You already filed I-131 and have a receipt number',
          'You want to know what your current status means',
          'You received a letter from USCIS and need an explanation',
        ],
      },
      {
        icon: '📄',
        title: 'Choose "Translate" if...',
        items: [
          'You have documents not in English (passport, certificate)',
          'USCIS requires an English translation for foreign-language documents',
          'You need a translation draft to complete your packet',
        ],
      },
    ],
    unsureBackBtn: '← Back to selection',
    legalNote: 'Not a law firm · You file with USCIS yourself',
  },
  es: {
    welcomeBack: '¡Bienvenido de nuevo!',
    welcomeBackDesc: 'Tiene una solicitud sin terminar. ¿Continuar donde lo dejó?',
    continueBtn: (step: number) => `Continuar (Paso ${step})`,
    startOver: 'Comenzar de nuevo',
    heading: '¿Qué necesita?',
    paths: [
      {
        key: 'packet',
        icon: '📦',
        title: 'Paquete Re-Parole',
        desc: 'Preparar el Formulario I-131 para extender su parole',
        cta: 'Comenzar →',
        accent: true,
      },
      {
        key: 'status',
        icon: '🔍',
        title: 'Estado del caso',
        desc: 'Verificar el estado de documentos ya presentados por número de recibo',
        cta: 'Verificar →',
        accent: false,
      },
      {
        key: 'translate',
        icon: '📄',
        title: 'Traducir documento',
        desc: 'Preparar un borrador de traducción de documentos para USCIS',
        cta: 'Traducir →',
        accent: false,
      },
      {
        key: 'unsure',
        icon: '🤔',
        title: 'No estoy seguro',
        desc: 'No sé qué elegir — muéstreme una sugerencia',
        cta: '¿Qué elegir? →',
        accent: false,
      },
    ],
    unsureTitle: '¿Cómo elegir?',
    unsureCards: [
      {
        icon: '📦',
        title: 'Elija "Paquete Re-Parole" si...',
        items: [
          'Su parole U4U está por vencer',
          'Quiere extender su derecho de permanencia en EE. UU.',
          'Necesita el Formulario I-131 completo y listo para enviar',
        ],
      },
      {
        icon: '🔍',
        title: 'Elija "Estado del caso" si...',
        items: [
          'Ya presentó el I-131 y tiene número de recibo',
          'Quiere saber qué significa su estado actual',
          'Recibió una carta de USCIS y necesita una explicación',
        ],
      },
      {
        icon: '📄',
        title: 'Elija "Traducir" si...',
        items: [
          'Tiene documentos no en inglés (pasaporte, certificado)',
          'USCIS requiere traducción al inglés de documentos en otro idioma',
          'Necesita un borrador de traducción para preparar su paquete',
        ],
      },
    ],
    unsureBackBtn: '← Volver a la selección',
    legalNote: 'No es bufete · Usted presenta ante USCIS',
  },
} as const

type Locale = keyof typeof T

export function Screen00() {
  const { state, setStep } = useWizard()
  const isReturning = Boolean(state.sessionId) && state.step > 0
  const t = T[(state.locale as Locale)] ?? T.en
  const [showUnsure, setShowUnsure] = useState(false)

  // Build locale-aware hrefs for navigation paths
  const locale = state.locale || 'en'
  const statusHref = `/${locale}/services/re-parole-u4u/status`
  const translateHref = `/${locale}/services/translate-document`

  function handlePath(key: string) {
    if (key === 'packet') { setStep(1); return }
    if (key === 'status') { window.location.href = statusHref; return }
    if (key === 'translate') { window.location.href = translateHref; return }
    if (key === 'unsure') { setShowUnsure(true); return }
  }

  // ── Unsure explanation view ──────────────────────────────────────────────
  if (showUnsure) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => setShowUnsure(false)}
          className="text-sm font-semibold"
          style={{ color: 'var(--primary)', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
        >
          {t.unsureBackBtn}
        </button>

        <h2 className="text-[20px] font-bold" style={{ color: 'var(--text-1)' }}>
          {t.unsureTitle}
        </h2>

        {t.unsureCards.map((card) => (
          <div
            key={card.icon}
            className="rounded-[12px] p-4"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <div className="flex items-center gap-2 mb-3">
              <span style={{ fontSize: '20px' }}>{card.icon}</span>
              <p className="text-[14px] font-700" style={{ color: 'var(--text-1)', fontWeight: 700 }}>
                {card.title}
              </p>
            </div>
            {card.items.map((item) => (
              <div key={item} className="flex gap-2 py-1 text-sm" style={{ color: 'var(--text-2)' }}>
                <span style={{ color: 'var(--success)', fontWeight: 700, flexShrink: 0 }}>✓</span>
                <span>{item}</span>
              </div>
            ))}
          </div>
        ))}

        {/* Repeat CTA to enter packet flow */}
        <button
          type="button"
          onClick={() => setStep(1)}
          className="w-full rounded-[10px] text-[16px] font-bold transition-all active:scale-[0.98]"
          style={{
            background: 'var(--success)',
            color: '#fff',
            border: 'none',
            padding: '16px',
            minHeight: '56px',
            boxShadow: '0 3px 14px rgba(22,163,74,0.25)',
          }}
        >
          {t.paths[0].cta}
        </button>
      </div>
    )
  }

  // ── Main path-selector view ──────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* Welcome-back card — returning users only */}
      {isReturning && (
        <div
          className="rounded-[12px] p-4"
          style={{ background: 'var(--info-bg)', border: '1.5px solid var(--info-border)' }}
        >
          <h3 className="text-[15px] font-semibold mb-1" style={{ color: 'var(--info-text)' }}>
            {t.welcomeBack}
          </h3>
          <p className="text-sm mb-3" style={{ color: 'var(--info-text)' }}>
            {t.welcomeBackDesc}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setStep(state.step)}
              className="flex-1 rounded-[8px] text-[14px] font-semibold transition-all active:scale-95"
              style={{
                background: 'var(--primary)',
                color: '#fff',
                border: 'none',
                padding: '10px',
                minHeight: '44px',
              }}
            >
              {t.continueBtn(state.step + 1)}
            </button>
            <button
              type="button"
              onClick={() => setStep(1)}
              className="rounded-[8px] text-sm font-medium transition-all active:scale-95"
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border-strong)',
                color: 'var(--text-1)',
                padding: '10px 14px',
                minHeight: '44px',
              }}
            >
              {t.startOver}
            </button>
          </div>
        </div>
      )}

      {/* Heading */}
      <h1 className="text-[22px] font-bold" style={{ color: 'var(--text-1)' }}>
        {t.heading}
      </h1>

      {/* 4 path cards */}
      <div className="flex flex-col gap-3">
        {t.paths.map((path) => (
          <button
            key={path.key}
            type="button"
            onClick={() => handlePath(path.key)}
            className="w-full text-left rounded-[12px] transition-all active:scale-[0.98]"
            style={{
              background: path.accent ? 'var(--success)' : 'var(--surface)',
              border: path.accent ? 'none' : '1px solid var(--border)',
              padding: '14px 16px',
              boxShadow: path.accent ? '0 3px 14px rgba(22,163,74,0.25)' : 'none',
              cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '26px', lineHeight: 1, flexShrink: 0 }}>{path.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p
                  style={{
                    fontSize: '15px',
                    fontWeight: 700,
                    color: path.accent ? '#fff' : 'var(--text-1)',
                    marginBottom: '3px',
                  }}
                >
                  {path.title}
                </p>
                <p
                  style={{
                    fontSize: '15px',
                    color: path.accent ? 'rgba(255,255,255,0.82)' : 'var(--text-3)',
                    lineHeight: 1.4,
                  }}
                >
                  {path.desc}
                </p>
              </div>
              <span
                style={{
                  fontSize: '15px',
                  fontWeight: 700,
                  color: path.accent ? '#fff' : 'var(--primary)',
                  flexShrink: 0,
                }}
              >
                {path.cta}
              </span>
            </div>
          </button>
        ))}
      </div>

      {/* Legal note */}
      <p className="text-sm text-center" style={{ color: 'var(--text-3)' }}>
        {t.legalNote}
      </p>
    </div>
  )
}
