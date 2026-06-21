/**
 * /[locale]/services/re-parole-u4u/checkout/cancel
 * User cancelled the Stripe checkout — return to service page
 */

interface Props {
  params: Promise<{ locale: string }>
}

const T = {
  uk: {
    title: '⚠ Оплату скасовано',
    body: 'Ви скасували оплату. Ваш прогрес збережено — ви можете повернутись і спробувати ще раз.',
    back: '← Повернутись до сервісу',
  },
  ru: {
    title: '⚠ Оплата отменена',
    body: 'Вы отменили оплату. Ваш прогресс сохранён — можете вернуться и попробовать снова.',
    back: '← Вернуться к сервису',
  },
  en: {
    title: '⚠ Payment cancelled',
    body: 'You cancelled the payment. Your progress is saved — you can return and try again.',
    back: '← Return to service',
  },
  es: {
    title: '⚠ Pago cancelado',
    body: 'Cancelaste el pago. Tu progreso está guardado — puedes regresar e intentarlo de nuevo.',
    back: '← Volver al servicio',
  },
} as const

type Locale = keyof typeof T

export default async function CheckoutCancelPage({ params }: Props) {
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
          href={`/${locale}/services/re-parole-u4u`}
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
            background: 'var(--primary)',
            textDecoration: 'none',
          }}
        >
          {t.back}
        </a>
      </div>
    </main>
  )
}
