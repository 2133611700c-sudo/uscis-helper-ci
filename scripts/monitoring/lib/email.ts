export async function sendDigest(html: string, subject: string): Promise<void> {
    const apiKey = process.env.RESEND_API_KEY
    const to = process.env.CONTACT_EMAIL_DESTINATION || '2133611700uscis@gmail.com'

  if (!apiKey) {
        console.log('=== EMAIL (dry run, RESEND_API_KEY not set) ===')
        console.log('To:', to)
        console.log('Subject:', subject)
        console.log(html)
        return
  }

  const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
        },
        body: JSON.stringify({
                from: 'monitor@messenginfo.com',
                to,
                subject,
                html,
        }),
  })

  if (!response.ok) {
        const body = await response.text().catch(() => '<unreadable>')
        throw new Error(`Email failed: ${response.status} ${response.statusText} — ${body}`)
  }
}
