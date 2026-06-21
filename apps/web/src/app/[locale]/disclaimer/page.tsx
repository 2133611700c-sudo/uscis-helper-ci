import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'legal.disclaimer' });
  return {
    title: `${t('title')} – Messenginfo`,
    description: t('alert'),
    robots: { index: true, follow: true },
  };
}

export default async function DisclaimerPage({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'legal.disclaimer' });
  const sections = (
    await import(`../../../../messages/${locale}.json`)
  ).default.legal.disclaimer.sections as { id: string; title: string; body: string }[];

  return (
    <article className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <Link href={`/${locale}`} className="text-sm text-muted-foreground hover:text-foreground mb-8 inline-block">
        {t('backHome')}
      </Link>
      <h1 className="text-4xl font-bold mb-2">{t('title')}</h1>
      <p className="text-sm text-muted-foreground mb-6">Last reviewed: {t('lastReviewed')}</p>

      {/* Prominent alert card */}
      <div className="mb-10 rounded-2xl border-2 border-amber-400 bg-amber-50 p-6 flex gap-4">
        <AlertTriangle className="w-8 h-8 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <p className="font-bold text-amber-900 text-lg">{t('alert')}</p>
          <p className="text-sm text-amber-800 mt-1">{t('notice')}</p>
        </div>
      </div>

      <div className="prose prose-slate max-w-none space-y-8">
        {sections.map((section) => (
          <div key={section.id}>
            <h2 className="text-xl font-semibold mb-3">{section.title}</h2>
            <p className="text-muted-foreground leading-relaxed">{section.body}</p>
          </div>
        ))}
      </div>
      <div className="mt-12 pt-6 border-t border-border">
        <Link href={`/${locale}`} className="text-sm text-primary hover:underline">
          {t('backHome')}
        </Link>
      </div>
    </article>
  );
}
