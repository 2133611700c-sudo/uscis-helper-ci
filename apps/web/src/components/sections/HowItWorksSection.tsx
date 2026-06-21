import { useTranslations } from 'next-intl';

export function HowItWorksSection() {
  const t = useTranslations('home.how');

  return (
    <section className="py-24 bg-muted/30">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground">{t('title')}</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex flex-col items-center text-center px-4">
              <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold text-lg mb-6 shrink-0">
                {i + 1}
              </div>
              <h3 className="text-lg font-semibold mb-3">{t(`steps.${i}.title`)}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {t(`steps.${i}.description`)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
