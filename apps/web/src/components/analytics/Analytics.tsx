'use client'
/**
 * Analytics — GA4 + PostHog
 * NEXT_PUBLIC_GA_MEASUREMENT_ID  = G-XXXXXXXXXX
 * NEXT_PUBLIC_POSTHOG_KEY        = phc_xxxxxxxxxx
 * NEXT_PUBLIC_POSTHOG_HOST       = https://us.i.posthog.com
 */
import Script from 'next/script'

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void
    dataLayer?: unknown[]
    posthog?: {
      capture: (event: string, props?: Record<string, unknown>) => void
      identify: (id: string, props?: Record<string, unknown>) => void
      reset: () => void
      init: (key: string, opts: Record<string, unknown>) => void
      loaded: boolean
    }
  }
}

/** Call from any client component to send an event to both GA4 and PostHog */
export function track(event: string, props?: Record<string, unknown>) {
  try {
    if (typeof window === 'undefined') return
    window.gtag?.('event', event, props ?? {})
    window.posthog?.capture(event, props)
  } catch { /* never throw from analytics */ }
}

const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID
const PH_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY
const PH_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com'

export function AnalyticsScripts() {
  return (
    <>
      {/* ── Google Analytics 4 ── */}
      {GA_ID && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
            strategy="afterInteractive"
          />
          <Script id="ga4-init" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${GA_ID}',{page_path:window.location.pathname});`}
          </Script>
        </>
      )}

      {/* ── PostHog ── */}
      {PH_KEY && (
        <Script id="posthog-init" strategy="afterInteractive">
          {`!function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]);t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+" (stub)"},o="capture identify alias people.set people.set_once set_config register register_once unregister opt_out_capturing has_opted_out_capturing opt_in_capturing reset isFeatureEnabled onFeatureFlags getFeatureFlag getFeatureFlagPayload reloadFeatureFlags group updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures getActiveMatchingSurveys getSurveys getNextSurveyStep onSessionId setPersonPropertiesForFlags".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
          posthog.init('${PH_KEY}',{api_host:'${PH_HOST}',person_profiles:'identified_only',capture_pageview:true,capture_pageleave:true,session_recording:{maskAllInputs:true,maskInputOptions:{password:true}}});`}
        </Script>
      )}
    </>
  )
}
