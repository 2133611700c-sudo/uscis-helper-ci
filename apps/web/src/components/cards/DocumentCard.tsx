import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { BookOpen, Baby, Heart, GraduationCap, Shield, Car } from 'lucide-react'
import { cn } from '@/lib/utils'
import { type DocumentCard as DocumentCardType } from '@/data/documentCards'

const iconMap = {
  passport: BookOpen,
  birth: Baby,
  marriage: Heart,
  diploma: GraduationCap,
  military: Shield,
  driver: Car,
}

interface DocumentCardProps {
  card: DocumentCardType
  locale: string
  className?: string
}

export function DocumentCard({ card, locale, className }: DocumentCardProps) {
  const t = useTranslations('documentTools')
  const Icon = iconMap[card.iconKey]
  const itemData = t.raw(`items.${card.id}`) as { title: string; description: string }

  return (
    <Link
      href={`/${locale}/services/translate-document`}
      className={cn(
        'flex items-start gap-3 rounded-card bg-white border border-slate-100 p-4',
        'shadow-card hover:shadow-card-hover transition-shadow duration-200',
        'hover:-translate-y-0.5 transition-transform group',
        className,
      )}
    >
      <div className="w-9 h-9 rounded-full bg-brand-50 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-brand-600" />
      </div>
      <div>
        <p className="text-base font-semibold text-ink-900 group-hover:text-brand-600 transition-colors">
          {itemData.title}
        </p>
        <p className="mt-1 text-sm text-ink-600 line-clamp-2">{itemData.description}</p>
      </div>
    </Link>
  )
}
