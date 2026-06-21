// Owner alert from a cron/script context. Two channels (first configured wins):
//  1. NATIVE Telegram Bot API: TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID (3-min BotFather setup)
//  2. Custom webhook: TELEGRAM_OWNER_WEBHOOK_URL (posts {text, metadata})
// Dry-run (logs) when neither is set. Never throws.
export async function sendOwnerAlert(text: string, metadata: Record<string, unknown> = {}): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (token && chatId) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: `${text}\n${JSON.stringify(metadata)}` }),
      })
      if (!res.ok) console.error('[owner-alert] telegram http', res.status)
      return
    } catch (e) { console.error('[owner-alert] telegram failed', String(e)) }
  }
  const url = process.env.TELEGRAM_OWNER_WEBHOOK_URL
  if (!url) {
    console.log('[owner-alert dry-run]', text, JSON.stringify(metadata))
    return
  }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, metadata }),
    })
    if (!res.ok) console.error('[owner-alert] http', res.status)
  } catch (e) {
    console.error('[owner-alert] failed', String(e))
  }
}
