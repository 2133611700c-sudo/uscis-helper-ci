import { useTranslations, useLocale } from 'next-intl';
import Link from 'next/link';

export function HeroSection() {
  const t = useTranslations('home.hero');
  const locale = useLocale();

  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-primary/5 to-background py-24 sm:py-32">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <span className="inline-block mb-6 px-3 py-1 text-xs font-medium rounded-full bg-primary/10 text-primary border border-primary/20">
          {t('badge')}
        </span>
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-foreground mb-6 leading-tight">
          {t('title')}
        </h1>
        <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
          {t('subtitle')}
        </p>
        <Link
          href={`/${locale}#contact`}
          className="inline-flex items-center justify-center h-12 px-8 rounded-xl bg-primary text-primary-foreground text-base font-medium hover:bg-primary/90 transition-colors"
        >
          {t('cta')}
        </Link>
      </div>
    </section>
  );
}
