import Link from 'next/link'
import Image from 'next/image'
import { useTranslations } from 'next-intl'
import { CheckCircle2, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { type ServiceCard as ServiceCardType } from '@/data/serviceCards'

interface ServiceCardProps {
  card: ServiceCardType
  locale: string
  className?: string
}

// Gradient palette for icon-only cards — one per service slug
const BANNER_GRADIENT: Record<string, string> = {
  'payment-problem':    'linear-gradient(135deg, #1e3a5f 0%, #2d5a8e 60%, #1a4a7a 100%)',
  'rfe-denial':         'linear-gradient(135deg, #4a1942 0%, #7b2d6e 60%, #5c1f52 100%)',
  'official-sources':   'linear-gradient(135deg, #0c1a35 0%, #1d3461 60%, #14294f 100%)',
  'tps-status':         'linear-gradient(135deg, #0d3d2b 0%, #1a6b4a 60%, #0f4f36 100%)',
  'attorney-directory': 'linear-gradient(135deg, #1a2744 0%, #2c3f6b 60%, #1e3058 100%)',
  'i-94-guide':         'linear-gradient(135deg, #0d3a4a 0%, #1a6b7a 60%, #0f4d5e 100%)',
}
const DEFAULT_BANNER = 'linear-gradient(135deg, #0c1a35 0%, #1d3461 60%, #14294f 100%)'

export function ServiceCard({ card, locale, className }: ServiceCardProps) {
  const t = useTranslations('cards')
  const tb = useTranslations('badges')
  const cardData = t.raw(card.id) as { title: string; shortProblem: string }
  const Icon = card.icon

  return (
    <Link
      href={`/${locale}/services/${card.slug}`}
      data-service-card={card.id}
      className={cn(
        'group flex h-full flex-col rounded-[14px] md:rounded-[20px] bg-white overflow-hidden',
        'border border-slate-200/70',
        'shadow-[0_2px_8px_rgba(0,0,0,0.06)]',
        'transition-[transform,box-shadow] duration-300 ease-out',
        'hover:-translate-y-[5px] hover:shadow-[0_12px_40px_rgba(0,0,0,0.12)]',
        'active:scale-[0.97] active:duration-100',
        className,
      )}
    >
      {/* ─── Banner: real image OR gradient with icon ─── */}
      <div className="relative w-full h-[200px] sm:h-[220px] md:h-[240px] lg:h-[260px] shrink-0 overflow-hidden">
        {card.image ? (
          <>
            <div className="absolute inset-0 bg-[#0c1a35]" />
            <Image
              src={card.image}
              alt={cardData.title}
              fill
              priority={card.sortOrder <= 4}
              className={cn(
                'object-contain object-center',
                'transition-transform duration-500 ease-in-out',
                'group-hover:scale-[1.04] group-active:scale-[1.02]',
              )}
              sizes="(min-width: 768px) 50vw, 100vw"
            />
          </>
        ) : (
          // Gradient banner with large centred icon for cards without a photo
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-3"
            style={{ background: BANNER_GRADIENT[card.slug] ?? DEFAULT_BANNER }}
          >
            <Icon
              className="text-white/80 transition-transform duration-500 group-hover:scale-110"
              style={{ width: 56, height: 56, strokeWidth: 1.4 }}
            />
            <div className="h-px w-12 bg-white/20 rounded-full" />
            <span className="text-white/50 text-xs font-medium tracking-widest uppercase select-none">
              messenginfo.com
            </span>
          </div>
        )}

        {/* Official source badge — overlaid bottom-left on every card */}
        {card.hasOfficialSource && (
          <span className="absolute bottom-2.5 left-2.5 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-white/92 backdrop-blur-sm text-brand-700 shadow-sm border border-white/60">
            <CheckCircle2 className="h-3 w-3 shrink-0" />
            {tb('officialSource')}
          </span>
        )}
      </div>

      {/* ─── Card content ─── */}
      <div className="flex flex-col gap-3 flex-1 p-4 md:p-5">
        {/* Title + description */}
        <div className="flex-1 space-y-1.5">
          <h3 className="font-semibold text-base text-ink-900 leading-snug group-hover:text-brand-600 transition-colors duration-200">
            {cardData.title}
          </h3>
          <p className="text-sm text-ink-600 leading-relaxed line-clamp-3">
            {cardData.shortProblem}
          </p>
        </div>

        {/* Footer CTA */}
        <div className="mt-auto flex items-center justify-end pt-1">
          <span className="flex items-center gap-1 text-sm font-medium text-brand-600 transition-transform duration-200 group-hover:translate-x-1">
            <ArrowRight className="h-4 w-4" />
          </span>
        </div>
      </div>
    </Link>
  )
}
