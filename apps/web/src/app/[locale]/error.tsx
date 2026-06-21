'use client';

import { useTranslations } from 'next-intl';

export default function Error({ reset }: { reset: () => void }) {
  const t = useTranslations('errors');
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 text-center px-4">
      <h1 className="text-4xl font-bold">500</h1>
      <p className="text-xl text-muted-foreground">{t('500')}</p>
      <button
        onClick={reset}
        className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90"
      >
        Try again
      </button>
    </div>
  );
}
