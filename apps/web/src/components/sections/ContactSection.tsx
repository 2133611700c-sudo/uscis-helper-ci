'use client';

import { useActionState, useRef } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import Link from 'next/link';
import { submitContact, type ContactFormState } from '@/app/[locale]/_actions/contact';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { CheckCircle, AlertCircle } from 'lucide-react';

const initialState: ContactFormState = { ok: false };

export function ContactSection() {
  const t = useTranslations('home.contact');
  const tForm = useTranslations('home.contact.form');
  const locale = useLocale();
  const [state, formAction, isPending] = useActionState(submitContact, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <section id="contact" className="py-24 bg-background">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">{t('title')}</h2>
          <p className="text-lg text-muted-foreground">{t('subtitle')}</p>
        </div>

        {state.ok ? (
          <div className="rounded-2xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 p-6 flex gap-4 items-start">
            <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
            <p className="text-green-800 dark:text-green-300 text-sm leading-relaxed">{tForm('success')}</p>
          </div>
        ) : (
          <form ref={formRef} action={formAction} className="space-y-6">
            {/* Honeypot — hidden from users, bots fill it */}
            <div aria-hidden="true" style={{ display: 'none' }}>
              <input type="text" name="honeypot" tabIndex={-1} autoComplete="off" />
            </div>
            <input type="hidden" name="locale" value={locale} />

            <div className="space-y-2">
              <Label htmlFor="name">{tForm('name')}</Label>
              <Input
                id="name"
                name="name"
                placeholder={tForm('namePlaceholder')}
                required
                minLength={2}
                maxLength={100}
                disabled={isPending}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">{tForm('email')}</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder={tForm('emailPlaceholder')}
                required
                disabled={isPending}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="message">{tForm('message')}</Label>
              <Textarea
                id="message"
                name="message"
                placeholder={tForm('messagePlaceholder')}
                required
                minLength={10}
                maxLength={2000}
                rows={5}
                disabled={isPending}
              />
            </div>

            <div className="flex items-start gap-3">
              <Checkbox id="consent" name="consent" value="true" required disabled={isPending} className="mt-0.5" />
              <Label htmlFor="consent" className="text-sm text-muted-foreground leading-relaxed font-normal cursor-pointer">
                {tForm('consent')}{' '}
                <Link href={`/${locale}/disclaimer`} className="text-primary underline underline-offset-4">
                  Disclaimer
                </Link>
              </Label>
            </div>

            {!state.ok && state.code && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 flex gap-2 items-start">
                <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                <p className="text-sm text-destructive">
                  {state.code === 'rateLimit'
                    ? tForm('rateLimit')
                    : state.code === 'validation'
                      ? tForm('validation')
                      : tForm('error')}
                </p>
              </div>
            )}

            <Button type="submit" disabled={isPending} size="lg" className="w-full rounded-xl">
              {isPending ? tForm('submitting') : tForm('submit')}
            </Button>
          </form>
        )}
      </div>
    </section>
  );
}
