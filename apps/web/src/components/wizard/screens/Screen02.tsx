'use client'

import { useState } from 'react'
import { useWizard } from '@/contexts/WizardContext'
import { calcPrice } from '@/contexts/WizardContext'
import { SupportBlock } from '@/components/wizard/SupportBlock'

const T = {
  uk: {
    title: 'Для кого готуємо пакет?',
    subtitle: 'Кожна людина потребує окремої Form I-131 — це вимога USCIS.',
    perPerson: '→ 2 людини = 2 окремі Form I-131',
    labels: ['Тільки я', '2 особи', '3 особи', '4 особи · Сімейний пакет', '5 осіб', '6 осіб'],
    saves: ['', 'економія $5', 'економія $10', 'економія $15', 'економія $20', 'економія $25'],
    subs: ['1 пакет', '', '', '', '', ''],
    moreBtn: '+ Більше 6 осіб',
    whyChip: 'Чому кожен потребує окремого пакету?',
    whyAnswer: 'USCIS вимагає окрему підписану форму I-131 для кожної особи, яка подає заявку. Один пакет для декількох людей не допускається.',
    peopleLabel: (n: number) => `${n} осіб`,
    saveLabel: (n: number) => `економія $${(n - 1) * 5}`,
  },
  ru: {
    title: 'Для кого готовим пакет?',
    subtitle: 'Каждый человек нуждается в отдельной Form I-131 — это требование USCIS.',
    perPerson: '→ 2 человека = 2 отдельные Form I-131',
    labels: ['Только я', '2 человека', '3 человека', '4 человека · Семейный пакет', '5 человек', '6 человек'],
    saves: ['', 'экономия $5', 'экономия $10', 'экономия $15', 'экономия $20', 'экономия $25'],
    subs: ['1 пакет', '', '', '', '', ''],
    moreBtn: '+ Более 6 человек',
    whyChip: 'Почему каждому нужен отдельный пакет?',
    whyAnswer: 'USCIS требует отдельную подписанную форму I-131 для каждого заявителя. Один пакет на несколько человек не допускается.',
    peopleLabel: (n: number) => `${n} человек`,
    saveLabel: (n: number) => `экономия $${(n - 1) * 5}`,
  },
  en: {
    title: 'Who are you preparing a packet for?',
    subtitle: 'Each person needs a separate I-131 packet — this is a USCIS requirement.',
    perPerson: '→ 2 people = 2 separate Form I-131 packets',
    labels: ['Just me', '2 people', '3 people', '4 people · Family Pack', '5 people', '6 people'],
    saves: ['', 'save $5', 'save $10', 'save $15', 'save $20', 'save $25'],
    subs: ['1 packet', '', '', '', '', ''],
    moreBtn: '+ More than 6 people',
    whyChip: 'Why does each person need a separate packet?',
    whyAnswer: 'USCIS requires a separate signed Form I-131 for each applicant. One packet for multiple people is not allowed.',
    peopleLabel: (n: number) => `${n} people`,
    saveLabel: (n: number) => `save $${(n - 1) * 5}`,
  },
  es: {
    title: '¿Para quién prepara el paquete?',
    subtitle: 'Cada persona necesita un paquete I-131 separado — es un requisito de USCIS.',
    perPerson: '→ 2 personas = 2 formularios I-131 separados',
    labels: ['Solo yo', '2 personas', '3 personas', '4 personas · Paquete familiar', '5 personas', '6 personas'],
    saves: ['', 'ahorra $5', 'ahorra $10', 'ahorra $15', 'ahorra $20', 'ahorra $25'],
    subs: ['1 paquete', '', '', '', '', ''],
    moreBtn: '+ Más de 6 personas',
    whyChip: '¿Por qué cada persona necesita un paquete separado?',
    whyAnswer: 'USCIS requiere un Formulario I-131 firmado por separado para cada solicitante. Un paquete para varias personas no está permitido.',
    peopleLabel: (n: number) => `${n} personas`,
    saveLabel: (n: number) => `ahorra $${(n - 1) * 5}`,
  },
} as const

const HIGHLIGHTS = [false, false, false, true, false, false]

export function Screen02() {
  const { state, setPackageSize } = useWizard()
  const { packageSize } = state
  const t = T[state.locale] ?? T.en
  const [whyOpen, setWhyOpen] = useState(false)

  function handleMore() {
    setPackageSize(packageSize + 1)
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[22px] font-bold leading-tight mb-2" style={{ color: 'var(--text-1)' }}>
          {t.title}
        </h1>
        <p className="text-[15px]" style={{ color: 'var(--text-2)' }}>
          {t.subtitle}
        </p>
        <p className="text-sm font-semibold mt-1" style={{ color: 'var(--info-text)' }}>
          {t.perPerson}
        </p>
      </div>

      {/* Package tiles */}
      <div className="space-y-2">
        {t.labels.map((label, idx) => {
          const size = idx + 1
          const isSelected = packageSize === size
          const save = t.saves[idx]
          const sub = t.subs[idx]
          const highlight = HIGHLIGHTS[idx]

          return (
            <button
              key={size}
              type="button"
              onClick={() => setPackageSize(size)}
              className="w-full flex items-center gap-3 rounded-[12px] text-left transition-all active:scale-[0.99]"
              style={{
                background: isSelected ? 'var(--accent)' : 'var(--surface)',
                border: isSelected
                  ? '2.5px solid var(--primary)'
                  : highlight
                    ? '1.5px solid var(--primary)'
                    : '1.5px solid var(--border-strong)',
                padding: isSelected ? '13.5px' : '14px',
                minHeight: '64px',
              }}
            >
              {/* Radio */}
              <div
                className="w-[22px] h-[22px] rounded-full flex-shrink-0 flex items-center justify-center"
                style={{
                  border: `2px solid ${isSelected ? 'var(--primary)' : 'var(--border-strong)'}`,
                }}
              >
                {isSelected && (
                  <span
                    className="w-[10px] h-[10px] rounded-full"
                    style={{ background: 'var(--primary)' }}
                  />
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-semibold" style={{ color: 'var(--text-1)' }}>
                  {label}
                </p>
                {save && (
                  <p className="text-sm font-bold mt-0.5" style={{ color: 'var(--success-text)' }}>
                    ✓ {save}
                  </p>
                )}
                {sub && (
                  <p className="text-sm mt-0.5" style={{ color: 'var(--text-3)' }}>
                    {sub}
                  </p>
                )}
              </div>

              {/* Price */}
              <span
                className="text-[17px] font-bold flex-shrink-0"
                style={{ color: 'var(--text-1)', fontVariantNumeric: 'tabular-nums' }}
              >
                ${calcPrice(size)}
              </span>
            </button>
          )
        })}

        {/* 7+ option */}
        {packageSize > 6 && (
          <div
            className="rounded-[12px] p-3.5 flex items-center justify-between"
            style={{ background: 'var(--accent)', border: '2.5px solid var(--primary)' }}
          >
            <div>
              <p className="text-[14px] font-semibold" style={{ color: 'var(--text-1)' }}>
                {t.peopleLabel(packageSize)}
              </p>
              <p className="text-sm font-bold" style={{ color: 'var(--success-text)' }}>
                ✓ {t.saveLabel(packageSize)}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setPackageSize(packageSize - 1)}
                className="w-[32px] h-[32px] rounded-full text-[18px] font-bold flex items-center justify-center"
                style={{ background: 'var(--surface)', border: '1px solid var(--border-strong)', color: 'var(--text-1)' }}
              >
                −
              </button>
              <span className="text-[17px] font-bold" style={{ color: 'var(--text-1)', fontVariantNumeric: 'tabular-nums' }}>
                ${calcPrice(packageSize)}
              </span>
              <button
                type="button"
                onClick={handleMore}
                className="w-[32px] h-[32px] rounded-full text-[18px] font-bold flex items-center justify-center"
                style={{ background: 'var(--surface)', border: '1px solid var(--border-strong)', color: 'var(--text-1)' }}
              >
                +
              </button>
            </div>
          </div>
        )}

        {/* Add more than 6 */}
        {packageSize <= 6 && (
          <button
            type="button"
            onClick={handleMore}
            className="w-full rounded-[12px] text-sm font-medium py-3 transition-all"
            style={{
              background: 'var(--surface-2)',
              border: '1px dashed var(--border-strong)',
              color: 'var(--text-3)',
            }}
          >
            {t.moreBtn}
          </button>
        )}
      </div>

      {/* Help chip — expandable */}
      <div>
        <button
          type="button"
          onClick={() => setWhyOpen((o) => !o)}
          className="inline-flex items-center gap-1.5 rounded-full text-sm font-medium px-2.5 py-1.5 transition-all"
          style={{
            background: 'var(--info-bg)',
            border: '1px solid var(--info-border)',
            color: 'var(--info-text)',
          }}
        >
          <span className="font-bold">{whyOpen ? '▲' : '?'}</span>
          {t.whyChip}
        </button>
        {whyOpen && (
          <div
            className="mt-2 rounded-[10px] p-3 text-sm leading-relaxed"
            style={{ background: 'var(--info-bg)', border: '1px solid var(--info-border)', color: 'var(--info-text)' }}
          >
            {t.whyAnswer}
          </div>
        )}
      </div>

      <SupportBlock locale={state.locale} />
    </div>
  )
}
