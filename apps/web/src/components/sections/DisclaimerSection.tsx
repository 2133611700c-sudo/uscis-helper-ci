import { useTranslations, useLocale } from 'next-intl';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';

export function DisclaimerSection() {
  const t = useTranslations('home.disclaimer');
  const locale = useLocale();

  return (
    <section className="py-16 bg-muted/30">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 flex gap-4">
          <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-amber-900 mb-2">{t('title')}</h3>
            <p className="text-sm text-amber-800 leading-relaxed">{t('body')}</p>
            <Link
              href={`/${locale}/disclaimer`}
              className="inline-block mt-3 text-sm font-medium text-amber-700 underline underline-offset-4 hover:text-amber-900"
            >
              Read full disclaimer →
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
