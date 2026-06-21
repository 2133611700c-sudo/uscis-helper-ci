/**
 * /delete-confirmed — shown after successful on-demand GDPR deletion
 * No locale routing — accessed via signed token link in email.
 */
export default function DeleteConfirmedPage() {
  return (
    <main style={{
      fontFamily: 'system-ui, sans-serif',
      maxWidth: '560px',
      margin: '80px auto',
      padding: '24px',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: '48px', marginBottom: '16px' }}>✅</div>
      <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#0f172a', marginBottom: '12px' }}>
        Your data has been deleted
      </h1>
      <p style={{ fontSize: '16px', color: '#475569', lineHeight: 1.6, marginBottom: '24px' }}>
        Your document and all associated information have been permanently removed
        from our servers. This action cannot be undone.
      </p>
      <p style={{ fontSize: '14px', color: '#94a3b8' }}>
        Messenginfo · GDPR/CCPA compliance
      </p>
    </main>
  )
}
