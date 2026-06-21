import { defineRouting } from 'next-intl/routing'

export const routing = defineRouting({
  locales: ['en', 'ru', 'uk', 'es'] as const,
  defaultLocale: 'en',
  localePrefix: 'always',
})
