import Link from 'next/link'
import Image from 'next/image'

interface LogoProps {
  locale: string
}

/**
 * Site logo.
 * The full wordmark image (messenginfo-full.webp) already contains
 * the "Messenginfo" text. No separate text label needed.
 */
export function Logo({ locale }: LogoProps) {
  return (
    <Link
      href={`/${locale}`}
      className="flex items-center gap-2"
      aria-label="Messenginfo home"
    >
      <Image
        src="/brand/messenginfo-full.webp"
        alt="Messenginfo"
        width={2508}
        height={627}
        className="shrink-0 w-auto h-8 sm:h-9 md:h-10"
        priority
      />
    </Link>
  )
}
