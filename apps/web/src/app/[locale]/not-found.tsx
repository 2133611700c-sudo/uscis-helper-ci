import { useTranslations } from 'next-intl';
import Link from 'next/link';

export default function NotFound() {
  // errors.404 in messages JSON is a nested object {title, body, back}.
  // next-intl forbids resolving a namespace to a non-string, so we scope
  // the translator to that nested object and pull the leaf keys.
  const t = useTranslations('errors.404');
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 text-center px-4">
      <h1 className="text-6xl font-bold text-muted-foreground">404</h1>
      <p className="text-xl text-foreground">{t('title')}</p>
      <p className="text-base text-muted-foreground">{t('body')}</p>
      <Link href="/" className="text-primary underline underline-offset-4 hover:opacity-80">
        {t('back')}
      </Link>
    </div>
  );
}
