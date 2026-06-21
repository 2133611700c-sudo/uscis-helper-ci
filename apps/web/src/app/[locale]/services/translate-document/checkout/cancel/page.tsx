/**
 * /[locale]/services/translate-document/checkout/cancel
 * Stage 10I — User cancelled Stripe checkout. Return to translation tool.
 */

interface Props {
  params: Promise<{ locale: string }>
}

const T = {
  en: {
    title: '⚠ Payment cancelled',
    body: 'You cancelled the payment. Your fields are still saved in the browser — return and try again anytime.',
    back: '← Return to Translate Documents',
  },
  uk: {
    title: '⚠ Оплату скасовано',
    body: 'Ви скасували оплату. Ваші поля збережено у браузері — поверніться і спробуйте ще раз.',
    back: '← Повернутись до Перекладу документів',
  },
  ru: {
    title: '⚠ Оплата отменена',
    body: 'Вы отменили оплату. Ваши поля сохранены в браузере — вернитесь и попробуйте снова.',
    back: '← Вернуться к Переводу документов',
  },
  es: {
    title: '⚠ Pago cancelado',
    body: 'Cancelaste el pago. Sus campos están guardados en el navegador — regrese e inténtelo de nuevo.',
    back: '← Volver a Traducción de documentos',
  },
} as const

type Locale = keyof typeof T

export default async function TranslationCheckoutCancelPage({ params }: Props) {
  const { locale } = (await params) as { locale: Locale }
  const t = T[locale] ?? T.en

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
        <p style={{ fontSize: '15px', color: 'var(--text-2)', lineHeight: 1.5, marginBottom: '24px' }}>
          {t.body}
        </p>
        <a
          href={`/${locale}/services/translate-document`}
          style={{
            display: 'block',
            width: '100%',
            height: '48px',
            lineHeight: '48px',
            textAlign: 'center',
            borderRadius: '10px',
            fontSize: '15px',
            fontWeight: 700,
            color: 'white',
            background: '#2563eb',
            textDecoration: 'none',
          }}
        >
          {t.back}
        </a>
      </div>
    </main>
  )
}
