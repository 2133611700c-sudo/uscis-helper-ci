'use client'
/**
 * SignaturePad — reusable signature capture component.
 * User draws with finger (mobile), mouse, or stylus.
 * Returns base64 PNG data URL for PDF embedding.
 *
 * Used by: TPS wizard (translation certification), Translation wizard.
 * Touch-optimized for users 30-80 years old on phones.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

interface Props {
  locale: 'uk' | 'ru' | 'en' | 'es'
  onSignatureChange: (dataUrl: string | null) => void
  height?: number
}

const L = {
  uk: { title: 'Підпишіть переклад', hint: '↑ Намалюйте підпис пальцем', clear: 'Очистити', desc: 'Підпис для сертифікації перекладу паспорта (8 CFR §103.2(b)(3)).' },
  ru: { title: 'Подпишите перевод', hint: '↑ Нарисуйте подпись пальцем', clear: 'Очистить', desc: 'Подпись для сертификации перевода паспорта (8 CFR §103.2(b)(3)).' },
  en: { title: 'Sign translation', hint: '↑ Draw signature with finger', clear: 'Clear', desc: 'Signature for passport translation certification (8 CFR §103.2(b)(3)).' },
  es: { title: 'Firme la traducción', hint: '↑ Dibuje firma con dedo', clear: 'Borrar', desc: 'Firma para certificación de traducción (8 CFR §103.2(b)(3)).' },
}

export default function SignaturePad({ locale, onSignatureChange, height = 140 }: Props) {
  const t = L[locale] || L.en
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null)
  const drawingRef = useRef(false)
  const drawnRef = useRef(false)
  const initRef = useRef(false)
  const [empty, setEmpty] = useState(true)

  useEffect(() => {
    const c = canvasRef.current
    if (!c || initRef.current) return
    initRef.current = true
    const r = window.devicePixelRatio || 1
    const rect = c.getBoundingClientRect()
    c.width = rect.width * r
    c.height = rect.height * r
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.scale(r, r)
    ctx.strokeStyle = 'var(--text-1, #111)'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctxRef.current = ctx

    const xy = (e: MouseEvent | Touch) => {
      const r = c.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    const start = (p: {x:number;y:number}) => { drawingRef.current = true; ctx.beginPath(); ctx.moveTo(p.x, p.y) }
    const move = (p: {x:number;y:number}) => { if (!drawingRef.current) return; ctx.lineTo(p.x, p.y); ctx.stroke(); drawnRef.current = true; setEmpty(false) }
    const end = () => { drawingRef.current = false; if (drawnRef.current) onSignatureChange(c.toDataURL('image/png')) }

    c.addEventListener('mousedown', e => start(xy(e)))
    c.addEventListener('mousemove', e => move(xy(e)))
    c.addEventListener('mouseup', end)
    c.addEventListener('mouseleave', () => { drawingRef.current = false })
    c.addEventListener('touchstart', e => { e.preventDefault(); start(xy(e.touches[0])) }, { passive: false })
    c.addEventListener('touchmove', e => { e.preventDefault(); move(xy(e.touches[0])) }, { passive: false })
    c.addEventListener('touchend', end)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const clear = useCallback(() => {
    const c = canvasRef.current; const ctx = ctxRef.current
    if (c && ctx) ctx.clearRect(0, 0, c.width, c.height)
    drawnRef.current = false; setEmpty(true); onSignatureChange(null)
  }, [onSignatureChange])

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-1)', marginBottom: 4 }}>{t.title}</div>
      <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 8 }}>{t.desc}</div>
      <div style={{ border: '2px dashed var(--border, #555)', borderRadius: 10, background: 'var(--surface-2, #1a1a2e)', position: 'relative' }}>
        <canvas ref={canvasRef} style={{ width: '100%', height, display: 'block', cursor: 'crosshair', touchAction: 'none', borderRadius: 10 }} />
        {empty && <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', color: 'var(--text-3, #888)', fontSize: 14, pointerEvents: 'none', userSelect: 'none' }}>{t.hint}</div>}
      </div>
      <button type="button" onClick={clear} style={{ marginTop: 6, padding: '4px 12px', fontSize: 13, background: 'transparent', color: 'var(--text-3)', border: '1px solid var(--border, #444)', borderRadius: 6, cursor: 'pointer' }}>{t.clear}</button>
    </div>
  )
}
