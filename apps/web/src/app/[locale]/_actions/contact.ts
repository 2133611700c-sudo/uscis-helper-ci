'use server';

import { z } from 'zod';
import { headers } from 'next/headers';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { sendContactNotification } from '@/lib/email/resend';

const contactSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  message: z.string().min(10).max(2000),
  consent: z.literal('true'),
  honeypot: z.string().max(0),
  locale: z.enum(['en', 'ru', 'uk', 'es']),
});

export type ContactFormState = {
  ok: boolean;
  code?: 'validation' | 'rateLimit' | 'serverError' | 'success';
};

async function checkRateLimit(ipHash: string, db: ReturnType<typeof createAdminSupabaseClient>): Promise<boolean> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await db
    .from('audit_log')
    .select('*', { count: 'exact', head: true })
    .eq('action', 'contact_form_submitted')
    .eq('ip_hash', ipHash)
    .gte('created_at', oneHourAgo);
  return (count ?? 0) < 5;
}

async function hashIp(ip: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(ip + process.env.HEALTH_TOKEN);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

export async function submitContact(
  _prevState: ContactFormState,
  formData: FormData,
): Promise<ContactFormState> {
  try {
    return await _submitContactImpl(_prevState, formData);
  } catch (err) {
    console.error('[contact] unhandled error:', err instanceof Error ? err.message : String(err));
    return { ok: false, code: 'serverError' };
  }
}

async function _submitContactImpl(
  _prevState: ContactFormState,
  formData: FormData,
): Promise<ContactFormState> {
  // a) Validate
  const raw = {
    name: formData.get('name'),
    email: formData.get('email'),
    message: formData.get('message'),
    consent: formData.get('consent'),
    honeypot: formData.get('honeypot') ?? '',
    locale: formData.get('locale'),
  };

  const parsed = contactSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, code: 'validation' };
  }

  const { name, email, message, locale } = parsed.data;

  // b) Honeypot — silently succeed without logging
  if ((raw.honeypot as string).length > 0) {
    return { ok: true, code: 'success' };
  }

  const db = createAdminSupabaseClient();

  // c) Get IP and hash it
  const headersList = await headers();
  const rawIp =
    headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    headersList.get('x-real-ip') ??
    'unknown';
  const ipHash = await hashIp(rawIp);
  const userAgent = headersList.get('user-agent') ?? '';

  // d) Rate limit via Supabase audit_log (Supabase fallback — KV not configured)
  const allowed = await checkRateLimit(ipHash, db);
  if (!allowed) {
    return { ok: false, code: 'rateLimit' };
  }

  // e) Insert into audit_log (columns: actor_id, action, target_table, target_id, detail, ip_hash)
  const { error: insertError } = await db.from('audit_log').insert({
    actor_id: null,
    action: 'contact_form_submitted',
    target_table: 'contact',
    target_id: null,
    detail: {
      name,
      email,
      message_length: message.length,
      message_preview: message.slice(0, 200),
      user_agent: userAgent.slice(0, 200),
      locale,
      email_sent: false, // Resend not configured
    } as Record<string, unknown>,
    ip_hash: ipHash,
  });

  if (insertError) {
    console.error('[contact] audit_log insert failed:', insertError.message);
    return { ok: false, code: 'serverError' };
  }

  // f) Send email via Resend lib (BCC applied automatically) — fire-and-forget
  try {
    await sendContactNotification({ name, email, message, locale });
    // Logging is handled inside sendContactNotification via email_events table
  } catch (emailErr) {
    console.error('[contact] email send failed:', emailErr instanceof Error ? emailErr.message : String(emailErr));
  }

  return { ok: true, code: 'success' };
}
