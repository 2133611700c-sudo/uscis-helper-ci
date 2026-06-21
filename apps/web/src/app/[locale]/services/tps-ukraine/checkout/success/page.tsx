/**
 * /[locale]/services/tps-ukraine/checkout/success
 * Returned to from Stripe after a successful payment. Redirects the user
 * back into the wizard at Step 6 with ?paid=1 so the download unlocks.
 */

interface Props {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ cs?: string; wizard?: string }>
}

const T = {
  uk: {
    title: '✅ Оплата отримана',
    body: 'Дякуємо. Зараз ми повернемо вас до вашого пакета — він буде доступний для завантаження.',
    back: '← Повернутись до пакета',
  },
  ru: {
    title: '✅ Оплата получена',
    body: 'Спасибо. Сейчас мы вернём вас к вашему пакету — он будет доступен для скачивания.',
    back: '← Вернуться к пакету',
  },
  en: {
    title: '✅ Payment received',
    body: 'Thank you. Returning you to your packet — it will be available for download.',
    back: '← Back to your packet',
  },
  es: {
    title: '✅ Pago recibido',
    body: 'Gracias. Volviendo a su paquete — estará disponible para descargar.',
    back: '← Volver a su paquete',
  },
} as const

type Locale = keyof typeof T

export default async function TpsCheckoutSuccessPage({ params, searchParams }: Props) {
  const { locale } = (await params) as { locale: Locale }
  const sp = await searchParams
  const t = T[locale] ?? T.en
  // Redirect back to the wizard with ?paid=1; the wizard reads this flag and
  // jumps straight to Step 6 in the unlocked (download-ready) state.
  const back = `/${locale}/services/tps-ukraine/start?paid=1${sp.cs ? `&cs=${encodeURIComponent(sp.cs)}` : ''}`

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
          background: '#fff',
          border: '1px solid #ddd',
          borderRadius: '16px',
          padding: '28px 24px',
          textAlign: 'center',
        }}
      >
        <h1 style={{ fontSize: '22px', fontWeight: 800, color: '#0d5a34', marginBottom: '12px' }}>
          {t.title}
        </h1>
        <p style={{ fontSize: '15px', color: '#374151', lineHeight: 1.5, marginBottom: '24px' }}>
          {t.body}
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
            color: '#fff',
            background: '#0d5a34',
            textDecoration: 'none',
          }}
        >
          {t.back}
        </a>
      </div>
    </main>
  )
}
