/**
 * /[locale]/services/re-parole-u4u/checkout/success
 * Stage 8I — Localized success page + back button
 */

interface Props {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ cs?: string; wizard?: string }>
}

const T = {
  uk: {
    title: '✅ Оплата отримана',
    body: 'Дякуємо. Зараз ми повернемо вас до вашого пакета — він буде доступний для завантаження.',
    note: 'Якщо сторінка не переходить автоматично — натисніть кнопку нижче.',
    back: '← Повернутись до пакета',
  },
  ru: {
    title: '✅ Оплата получена',
    body: 'Спасибо. Сейчас мы вернём вас к вашему пакету — он будет доступен для скачивания.',
    note: 'Если страница не переходит автоматически — нажмите кнопку ниже.',
    back: '← Вернуться к пакету',
  },
  en: {
    title: '✅ Payment received',
    body: 'Thank you. Returning you to your packet — it will be available for download.',
    note: 'If the page does not redirect automatically, use the button below.',
    back: '← Back to your packet',
  },
  es: {
    title: '✅ Pago recibido',
    body: 'Gracias. Volviendo a su paquete — estará disponible para descargar.',
    note: 'Si la página no redirige automáticamente, use el botón de abajo.',
    back: '← Volver a su paquete',
  },
} as const

type Locale = keyof typeof T

export default async function CheckoutSuccessPage({ params, searchParams }: Props) {
  const { locale } = (await params) as { locale: Locale }
  const sp = await searchParams
  const t = T[locale] ?? T.en
  // Redirect back to the wizard with ?paid=1&cs=<session>; the wizard reads the
  // flag (unlock) and carries cs as the X-Payment-Token for server verification.
  const back = `/${locale}/services/re-parole-u4u/start?paid=1${sp.cs ? `&cs=${encodeURIComponent(sp.cs)}` : ''}`

  return (
    <main
      style={{
        minHeight: '100dvh',
        background: 'var(--background)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 20px',
      }}
    >
      <meta httpEquiv="refresh" content={`3;url=${back}`} />
      <div
        style={{
          width: '100%',
          maxWidth: '480px',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '16px',
          padding: '28px 24px',
          textAlign: 'center',
        }}
      >
        <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-1)', marginBottom: '12px' }}>
          {t.title}
        </h1>
        <p style={{ fontSize: '15px', color: 'var(--text-2)', lineHeight: 1.5, marginBottom: '12px' }}>
          {t.body}
        </p>
        <p style={{ fontSize: '15px', color: 'var(--text-3)', lineHeight: 1.5, marginBottom: '24px' }}>
          {t.note}
        </p>
        <a
          href={back}
          style={{
            display: 'block',
            width: '100%',
            height: '48px',
            lineHeight: '48px',
            textAlign: 'center',
            borderRadius: '10px',
            fontSize: '15px',
            fontWeight: 700,
            color: 'var(--primary)',
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            textDecoration: 'none',
          }}
        >
          {t.back}
        </a>
      </div>
    </main>
  )
}
