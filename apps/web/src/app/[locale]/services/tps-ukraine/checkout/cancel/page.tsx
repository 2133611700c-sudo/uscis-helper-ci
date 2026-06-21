/**
 * /[locale]/services/tps-ukraine/checkout/cancel
 * Returned to from Stripe when the user cancels payment.
 */

interface Props {
  params: Promise<{ locale: string }>
}

const T = {
  uk: { title: 'Оплату скасовано', body: 'Ваші відповіді збережено. Можете повернутися та спробувати ще раз.', back: '← Назад до пакета' },
  ru: { title: 'Оплата отменена', body: 'Ваши ответы сохранены. Можете вернуться и попробовать ещё раз.', back: '← Назад к пакету' },
  en: { title: 'Payment cancelled', body: 'Your answers are saved. You can return and try again.', back: '← Back to your packet' },
  es: { title: 'Pago cancelado', body: 'Sus respuestas están guardadas. Puede volver e intentar de nuevo.', back: '← Volver a su paquete' },
} as const
type Locale = keyof typeof T

export default async function TpsCheckoutCancelPage({ params }: Props) {
  const { locale } = (await params) as { locale: Locale }
  const t = T[locale] ?? T.en
  const back = `/${locale}/services/tps-ukraine/start`
  return (
    <main style={{ minHeight: '100dvh', background: '#f4f5f7', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 20px' }}>
      <div style={{ width: '100%', maxWidth: 480, background: '#fff', border: '1px solid #ddd', borderRadius: 16, padding: '28px 24px', textAlign: 'center' }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0d5a34', marginBottom: 12 }}>{t.title}</h1>
        <p style={{ fontSize: 15, color: '#374151', lineHeight: 1.5, marginBottom: 24 }}>{t.body}</p>
        <a href={back} style={{ display: 'block', width: '100%', height: 48, lineHeight: '48px', textAlign: 'center', borderRadius: 10, fontSize: 15, fontWeight: 700, color: '#fff', background: '#0d5a34', textDecoration: 'none' }}>{t.back}</a>
      </div>
    </main>
  )
}
