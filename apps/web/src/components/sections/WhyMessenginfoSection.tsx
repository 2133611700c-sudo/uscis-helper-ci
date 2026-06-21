import { useTranslations } from 'next-intl';
import { ShieldCheck, Globe, Lock } from 'lucide-react';

const icons = [ShieldCheck, Globe, Lock];

export function WhyMessenginfoSection() {
  const t = useTranslations('home.why');

  return (
    <section className="py-24 bg-background">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground">{t('title')}</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {[0, 1, 2].map((i) => {
            const Icon = icons[i];
            return (
              <div key={i} className="flex flex-col items-start gap-4 p-6 rounded-2xl border border-border bg-card">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Icon className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-base font-semibold mb-2">{t(`points.${i}.title`)}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {t(`points.${i}.description`)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
