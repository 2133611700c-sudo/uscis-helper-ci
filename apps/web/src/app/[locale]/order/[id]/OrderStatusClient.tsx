'use client'

/**
 * Client half of /order/[id]: polls GET /api/order/{id} every 30s and renders
 * a calm 3-step progress view (Received → In review → Completed) for
 * non-technical users (30–80yo). No PII is ever rendered — only status,
 * a document-type label and timestamps. 'closed' shows a neutral contact state.
 */
import { useCallback, useEffect, useState } from 'react'

type OrderStatus = 'received' | 'in_review' | 'completed' | 'closed'

interface OrderData {
  ok: true
  status: OrderStatus
  doc_type: string
  created_at: string
  estimated_hours: number
}

interface Texts {
  title: string
  steps: [string, string, string]
  received_msg: string
  in_review_msg: string
  completed_msg: string
  closed_msg: string
  not_found: string
  load_error: string
  loading: string
  resend_btn: string
  resend_ok: string
  resend_rate_limited: string
  resend_not_completed: string
  resend_error: string
  doc_label: string
  created_label: string
  eta: (h: number) => string
}

const T: Record<string, Texts> = {
  en: {
    title: 'Your translation order',
    steps: ['Received', 'In review', 'Completed'],
    received_msg:
      'We received your order. Our specialist is preparing your translation. The finished PDF will arrive in your email inbox.',
    in_review_msg:
      'Our specialist is reviewing your translation right now. The finished PDF will arrive in your email inbox.',
    completed_msg:
      'Your translation is ready. We sent the PDF to your email. Please check your inbox — and the spam folder, just in case.',
    closed_msg:
      'This order is closed. If you have any questions, please contact us — we are happy to help.',
    not_found:
      'We could not find this order. Please check the link from your email, or contact us.',
    load_error: 'Something went wrong while checking your order. Please try again in a minute.',
    loading: 'Checking your order…',
    resend_btn: "Didn't get the email?",
    resend_ok: 'Done — we sent the email again. Please check your inbox and spam folder.',
    resend_rate_limited: 'We just sent it. Please wait a few minutes and check your spam folder.',
    resend_not_completed:
      'The translation is not finished yet. As soon as it is ready, the email will arrive automatically.',
    resend_error: 'Could not resend right now. Please try again in a minute.',
    doc_label: 'Document',
    created_label: 'Order placed',
    eta: (h) => `Usually ready within ${h} hours.`,
  },
  ru: {
    title: 'Ваш заказ на перевод',
    steps: ['Получен', 'Проверка', 'Готово'],
    received_msg:
      'Заказ получен. Наш специалист проверяет перевод. Готовый PDF придёт на вашу почту в течение 24 часов.',
    in_review_msg:
      'Наш специалист сейчас проверяет ваш перевод. Готовый PDF придёт на вашу почту.',
    completed_msg:
      'Перевод готов. Мы отправили PDF на вашу почту. Проверьте входящие — и папку «Спам» на всякий случай.',
    closed_msg: 'Этот заказ закрыт. Если у вас есть вопросы — напишите нам, мы поможем.',
    not_found: 'Мы не нашли этот заказ. Проверьте ссылку из письма или напишите нам.',
    load_error: 'Не получилось проверить заказ. Попробуйте ещё раз через минуту.',
    loading: 'Проверяем ваш заказ…',
    resend_btn: 'Не пришло письмо?',
    resend_ok: 'Готово — мы отправили письмо ещё раз. Проверьте входящие и папку «Спам».',
    resend_rate_limited: 'Мы только что отправили письмо. Подождите несколько минут и проверьте папку «Спам».',
    resend_not_completed: 'Перевод ещё не готов. Как только он будет готов, письмо придёт автоматически.',
    resend_error: 'Не получилось отправить письмо. Попробуйте ещё раз через минуту.',
    doc_label: 'Документ',
    created_label: 'Заказ оформлен',
    eta: (h) => `Обычно готово в течение ${h} часов.`,
  },
  uk: {
    title: 'Ваше замовлення на переклад',
    steps: ['Отримано', 'Перевірка', 'Готово'],
    received_msg:
      'Замовлення отримано. Наш спеціаліст перевіряє переклад. Готовий PDF надійде на вашу пошту протягом 24 годин.',
    in_review_msg:
      'Наш спеціаліст зараз перевіряє ваш переклад. Готовий PDF надійде на вашу пошту.',
    completed_msg:
      'Переклад готовий. Ми надіслали PDF на вашу пошту. Перевірте вхідні — і папку «Спам» про всяк випадок.',
    closed_msg: 'Це замовлення закрито. Якщо у вас є запитання — напишіть нам, ми допоможемо.',
    not_found: 'Ми не знайшли це замовлення. Перевірте посилання з листа або напишіть нам.',
    load_error: 'Не вдалося перевірити замовлення. Спробуйте ще раз за хвилину.',
    loading: 'Перевіряємо ваше замовлення…',
    resend_btn: 'Не надійшов лист?',
    resend_ok: 'Готово — ми надіслали лист ще раз. Перевірте вхідні та папку «Спам».',
    resend_rate_limited: 'Ми щойно надіслали лист. Зачекайте кілька хвилин і перевірте папку «Спам».',
    resend_not_completed: 'Переклад ще не готовий. Щойно він буде готовий, лист надійде автоматично.',
    resend_error: 'Не вдалося надіслати лист. Спробуйте ще раз за хвилину.',
    doc_label: 'Документ',
    created_label: 'Замовлення оформлено',
    eta: (h) => `Зазвичай готово протягом ${h} годин.`,
  },
  es: {
    title: 'Su pedido de traducción',
    steps: ['Recibido', 'En revisión', 'Listo'],
    received_msg:
      'Recibimos su pedido. Nuestro especialista está preparando su traducción. El PDF terminado llegará a su correo.',
    in_review_msg:
      'Nuestro especialista está revisando su traducción ahora. El PDF terminado llegará a su correo.',
    completed_msg:
      'Su traducción está lista. Enviamos el PDF a su correo. Revise su bandeja de entrada — y la carpeta de spam, por si acaso.',
    closed_msg: 'Este pedido está cerrado. Si tiene preguntas, escríbanos — con gusto le ayudamos.',
    not_found: 'No encontramos este pedido. Revise el enlace de su correo o escríbanos.',
    load_error: 'No pudimos verificar su pedido. Inténtelo de nuevo en un minuto.',
    loading: 'Verificando su pedido…',
    resend_btn: '¿No llegó el correo?',
    resend_ok: 'Listo — enviamos el correo de nuevo. Revise su bandeja de entrada y la carpeta de spam.',
    resend_rate_limited: 'Acabamos de enviarlo. Espere unos minutos y revise la carpeta de spam.',
    resend_not_completed: 'La traducción aún no está lista. En cuanto esté lista, el correo llegará automáticamente.',
    resend_error: 'No pudimos reenviar el correo. Inténtelo de nuevo en un minuto.',
    doc_label: 'Documento',
    created_label: 'Pedido realizado',
    eta: (h) => `Normalmente listo en ${h} horas.`,
  },
}

const POLL_MS = 30_000

const STEP_INDEX: Record<OrderStatus, number> = {
  received: 0,
  in_review: 1,
  completed: 2,
  closed: -1,
}

export default function OrderStatusClient({ locale, orderId }: { locale: string; orderId: string }) {
  const t = T[locale] ?? T.en
  const [order, setOrder] = useState<OrderData | null>(null)
  const [errorKind, setErrorKind] = useState<'none' | 'not_found' | 'load_error'>('none')
  const [loading, setLoading] = useState(true)
  const [resendMsg, setResendMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [resending, setResending] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/order/${encodeURIComponent(orderId)}`, { cache: 'no-store' })
      if (res.status === 404) {
        setErrorKind('not_found')
        setOrder(null)
        return
      }
      const data = (await res.json()) as OrderData | { ok: false }
      if (res.ok && data.ok) {
        setOrder(data)
        setErrorKind('none')
      } else {
        setErrorKind('load_error')
      }
    } catch {
      setErrorKind('load_error')
    } finally {
      setLoading(false)
    }
  }, [orderId])

  useEffect(() => {
    void load()
    const timer = setInterval(() => void load(), POLL_MS)
    return () => clearInterval(timer)
  }, [load])

  const resend = useCallback(async () => {
    setResending(true)
    setResendMsg(null)
    try {
      const res = await fetch(`/api/order/${encodeURIComponent(orderId)}/resend`, { method: 'POST' })
      if (res.ok) {
        setResendMsg({ text: t.resend_ok, ok: true })
      } else if (res.status === 429) {
        setResendMsg({ text: t.resend_rate_limited, ok: true })
      } else if (res.status === 409) {
        setResendMsg({ text: t.resend_not_completed, ok: true })
      } else {
        setResendMsg({ text: t.resend_error, ok: false })
      }
    } catch {
      setResendMsg({ text: t.resend_error, ok: false })
    } finally {
      setResending(false)
    }
  }, [orderId, t])

  const wrap: React.CSSProperties = {
    maxWidth: 640,
    margin: '0 auto',
    padding: '40px 20px',
    color: 'var(--text-1)',
  }

  if (loading && !order) {
    return (
      <main style={wrap}>
        <h1 style={{ fontSize: 28, marginBottom: 16 }}>{t.title}</h1>
        <p style={{ color: 'var(--text-2, #666)' }}>{t.loading}</p>
      </main>
    )
  }

  if (errorKind === 'not_found' || (!order && errorKind === 'load_error')) {
    return (
      <main style={wrap}>
        <h1 style={{ fontSize: 28, marginBottom: 16 }}>{t.title}</h1>
        <p
          style={{
            background: 'var(--surface-1, #f6f4f0)',
            borderRadius: 12,
            padding: '16px 18px',
            fontSize: 16,
            lineHeight: 1.5,
          }}
        >
          {errorKind === 'not_found' ? t.not_found : t.load_error}
        </p>
      </main>
    )
  }

  if (!order) return null

  const stepIdx = STEP_INDEX[order.status]
  const message =
    order.status === 'received'
      ? t.received_msg
      : order.status === 'in_review'
        ? t.in_review_msg
        : order.status === 'completed'
          ? t.completed_msg
          : t.closed_msg

  const createdDate = (() => {
    const d = new Date(order.created_at)
    return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString(locale)
  })()

  return (
    <main style={wrap}>
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>{t.title}</h1>
      <p style={{ color: 'var(--text-2, #666)', fontSize: 14, marginBottom: 24 }}>
        {t.doc_label}: {order.doc_type}
        {createdDate ? ` · ${t.created_label}: ${createdDate}` : ''}
      </p>

      {order.status !== 'closed' && (
        <ol
          style={{
            display: 'flex',
            gap: 8,
            listStyle: 'none',
            margin: '0 0 24px',
            padding: 0,
          }}
        >
          {t.steps.map((label, i) => {
            const done = i < stepIdx
            const current = i === stepIdx
            return (
              <li
                key={label}
                aria-current={current ? 'step' : undefined}
                style={{
                  flex: 1,
                  textAlign: 'center',
                  padding: '10px 6px',
                  borderRadius: 10,
                  fontSize: 14,
                  fontWeight: current ? 700 : 400,
                  background: current
                    ? 'var(--accent, #2c7a4b)'
                    : 'var(--surface-1, #f6f4f0)',
                  color: current ? '#fff' : done ? 'var(--text-1)' : 'var(--text-2, #888)',
                  border: '1px solid var(--border, #e3ded6)',
                }}
              >
                {done ? '✓ ' : ''}
                {label}
              </li>
            )
          })}
        </ol>
      )}

      <p
        style={{
          background: 'var(--surface-1, #f6f4f0)',
          borderRadius: 12,
          padding: '16px 18px',
          fontSize: 16,
          lineHeight: 1.5,
          marginBottom: 16,
        }}
      >
        {message}
      </p>

      {(order.status === 'received' || order.status === 'in_review') &&
        order.estimated_hours > 0 && (
          <p style={{ color: 'var(--text-2, #666)', fontSize: 14, marginBottom: 24 }}>
            {t.eta(order.estimated_hours)}
          </p>
        )}

      {order.status !== 'closed' && (
        <div>
          <button
            type="button"
            onClick={() => void resend()}
            disabled={resending}
            style={{
              padding: '10px 18px',
              borderRadius: 10,
              border: '1px solid var(--border, #e3ded6)',
              background: 'var(--surface-1, #fff)',
              color: 'var(--text-1)',
              fontSize: 15,
              cursor: resending ? 'default' : 'pointer',
              opacity: resending ? 0.6 : 1,
            }}
          >
            {t.resend_btn}
          </button>
          {resendMsg && (
            <p
              role="status"
              style={{
                marginTop: 12,
                fontSize: 14,
                color: resendMsg.ok ? 'var(--text-1)' : '#b3261e',
              }}
            >
              {resendMsg.text}
            </p>
          )}
        </div>
      )}
    </main>
  )
}
