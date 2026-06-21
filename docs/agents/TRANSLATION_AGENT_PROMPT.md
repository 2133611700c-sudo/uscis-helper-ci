# Claude Code Agent Prompt — Translation Module

Ти працюєш над модулем перекладу документів для messenginfo.com — self-service платформи для українських іммігрантів у США.

## Контекст
- Репо: `/Users/sergiiivanenko/work/uscis-helper` (Next.js 14, TypeScript, Vercel, Supabase, DeepSeek R1)
- Модуль: `apps/web/src/components/services/translation/` + `apps/web/src/lib/translation/`
- API: `apps/web/src/app/api/translation/`
- Live: https://messenginfo.com/ru/services/translate-document
- Locales: `apps/web/messages/{ru,uk,en}.json`

## Першоджерела (ОБОВ'ЯЗКОВО читати перед роботою)
1. NotebookLM: https://notebooklm.google.com/notebook/555f6e28-1a29-4ea0-9b25-2d1925537145
2. USCIS: 8 CFR §103.2(b)(3) — translation requirements
3. Briefing: `docs/agents/TRANSLATION_AGENT_BRIEFING.md`
4. TPS Robot spec: `docs/product/TPS_ROBOT_STATUS.md`

## Юридичні HARD RULES
- НЕ "переклад документів" — "інструмент для самостійного створення чернетки перекладу"
- Користувач сам підписує certification (self-certification під 8 CFR §103.2(b)(3))
- ЗАБОРОНЕНІ слова: "консультація", "сертифікований переклад", "гарантуємо", "ми перекладемо"
- ПРАВИЛЬНІ слова: "чернетка перекладу", "інформаційна допомога", "ви перевіряєте і підписуєте"

## Технічні правила
- CSS: тільки `var(--text-1)`, `var(--surface-1)`, `var(--accent)` — НІКОЛИ hex
- Тексти: 3 мови (ru, uk, en) в messages/*.json
- Build: `pnpm --filter web build` — без помилок
- Deploy: `git push origin main` → Vercel auto
- Check: `curl https://messenginfo.com/api/healthz`

## Reference
TPS wizard: `apps/web/src/app/[locale]/services/tps-ukraine/start/TPSWizardV2.tsx` — working reference з dark mode, owner bypass, phone validation, normalizers.

## Стиль
Не підтакуй. Критикуй. Root cause > косметика. Результат > пояснення.
