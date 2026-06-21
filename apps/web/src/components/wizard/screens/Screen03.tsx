'use client'

import { useWizard } from '@/contexts/WizardContext'

const T = {
  uk: {
    title: 'Члени сім\'ї',
    subtitle: 'Дайте кожній людині прізвисько, щоб їх розрізняти. Справжні імена не зберігаються.',
    mainApplicant: 'Я — Головний заявник',
    memberLabel: (i: number) => `Член сім\'ї ${i}`,
    packetLabel: (i: number) => `Пакет ${i}`,
    placeholderMe: 'напр. "Я" або прізвисько',
    placeholderOther: (i: number) => `Прізвисько особи ${i}`,
    addPerson: '+ Додати ще одну особу',
    tooMany: 'Для груп більше 10 осіб — зв\'яжіться з нами.',
    saveNote: '📧 Хочете зберегти пакет та отримати посилання?',
    saveLink: 'Введіть e-mail після оплати — ми надішлемо посилання на завантаження.',
  },
  ru: {
    title: 'Члены семьи',
    subtitle: 'Дайте каждому человеку прозвище, чтобы их различать. Настоящие имена не сохраняются.',
    mainApplicant: 'Я — Главный заявитель',
    memberLabel: (i: number) => `Член семьи ${i}`,
    packetLabel: (i: number) => `Пакет ${i}`,
    placeholderMe: 'напр. "Я" или прозвище',
    placeholderOther: (i: number) => `Прозвище человека ${i}`,
    addPerson: '+ Добавить ещё одного человека',
    tooMany: 'Для групп более 10 человек — свяжитесь с нами.',
    saveNote: '📧 Хотите сохранить пакет и получить ссылку?',
    saveLink: 'Введите e-mail после оплаты — мы отправим ссылку на скачивание.',
  },
  en: {
    title: 'Family members',
    subtitle: 'Give each person a nickname to tell them apart. Real names are not stored.',
    mainApplicant: 'Me — Main applicant',
    memberLabel: (i: number) => `Member ${i}`,
    packetLabel: (i: number) => `Packet ${i}`,
    placeholderMe: 'e.g. "Me" or nickname',
    placeholderOther: (i: number) => `Person ${i} nickname`,
    addPerson: '+ Add another person',
    tooMany: 'For groups larger than 10, please contact us.',
    saveNote: '📧 Want to save your packet and get a download link?',
    saveLink: 'Enter your email after payment — we\'ll send a download link.',
  },
  es: {
    title: 'Miembros de la familia',
    subtitle: 'Dé a cada persona un apodo para distinguirlos. Los nombres reales no se almacenan.',
    mainApplicant: 'Yo — Solicitante principal',
    memberLabel: (i: number) => `Miembro ${i}`,
    packetLabel: (i: number) => `Paquete ${i}`,
    placeholderMe: 'ej. "Yo" o apodo',
    placeholderOther: (i: number) => `Apodo persona ${i}`,
    addPerson: '+ Agregar otra persona',
    tooMany: 'Para grupos de más de 10 personas, contáctenos.',
    saveNote: '📧 ¿Quiere guardar su paquete y recibir un enlace?',
    saveLink: 'Ingrese su correo después del pago — le enviaremos el enlace de descarga.',
  },
} as const

export function Screen03() {
  const { state, setPackageSize, setMember } = useWizard()
  const { members, packageSize } = state
  const t = T[state.locale] ?? T.en

  function handleAliasChange(id: string, value: string) {
    setMember(id, { alias: value })
  }

  function handleAddPerson() {
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
      </div>

      <div className="space-y-2.5">
        {members.map((member, i) => (
          <div
            key={member.id}
            className="rounded-[12px] p-3"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-[14px] font-semibold" style={{ color: 'var(--text-1)' }}>
                {i === 0 ? t.mainApplicant : t.memberLabel(i + 1)}
              </span>
              <span className="text-sm" style={{ color: 'var(--text-3)' }}>
                {t.packetLabel(i + 1)}
              </span>
            </div>
            <input
              type="text"
              value={member.alias}
              onChange={(e) => handleAliasChange(member.id, e.target.value)}
              placeholder={i === 0 ? t.placeholderMe : t.placeholderOther(i + 1)}
              aria-label={`Alias for person ${i + 1}`}
              className="w-full rounded-[8px] text-[16px] transition-all"
              style={{
                background: 'var(--surface-2)',
                color: 'var(--text-1)',
                border: '1px solid var(--border)',
                padding: '11px 12px',
                minHeight: '44px',
                outline: 'none',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'var(--primary)'
                e.currentTarget.style.background = 'var(--surface)'
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'var(--border)'
                e.currentTarget.style.background = 'var(--surface-2)'
              }}
            />
          </div>
        ))}
      </div>

      {packageSize < 10 ? (
        <button
          type="button"
          onClick={handleAddPerson}
          className="w-full rounded-[12px] py-3 text-[14px] font-medium transition-all"
          style={{
            background: 'var(--surface-2)',
            border: '1.5px dashed var(--border-strong)',
            color: 'var(--text-3)',
          }}
        >
          {t.addPerson}
        </button>
      ) : (
        <p className="text-sm text-center" style={{ color: 'var(--text-3)' }}>
          {t.tooMany}
        </p>
      )}

      {/* Info note */}
      <div
        className="rounded-[12px] p-3.5 text-sm leading-relaxed"
        style={{ background: 'var(--surface-2)', color: 'var(--text-2)', border: '1px solid var(--border)' }}
      >
        {t.saveNote}{' '}
        <span style={{ color: 'var(--primary)', fontWeight: 600 }}>
          {t.saveLink}
        </span>
      </div>
    </div>
  )
}
