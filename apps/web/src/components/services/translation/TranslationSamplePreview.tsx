/**
 * TranslationSamplePreview — v2
 *
 * Shows a watermarked fake-data birth certificate translation sample.
 * All fields use fictional demo data (Taras Shevchenko, 1814).
 * Diagonal "SAMPLE — NOT VALID FOR FILING" watermark overlays the document.
 * No real template content is copyable.
 */

export function TranslationSamplePreview({ locale }: { locale: string }) {
  const text = {
    uk: {
      heading: 'Ось як виглядає готовий переклад',
      sub: 'Свідоцтво про народження · Зразок (демо-дані)',
      watermark: 'ЗРАЗОК — НЕ ДІЙСНИЙ ДЛЯ ПОДАЧІ',
      docTitle: 'CERTIFICATE OF BIRTH',
      docSub: 'Translation from Ukrainian — Self-Certified under 8 CFR §103.2(b)(3)',
      certTitle: 'TRANSLATOR CERTIFICATION',
      certBody: 'I, [Translator Full Name], residing at [US Address], certify that I am competent to translate from Ukrainian to English, and that the above translation is accurate and complete to the best of my knowledge and belief.',
      certSig: 'Signature: _________________ Date: _____________',
      certAddr: 'Address: [123 Main St, City, State ZIP]',
      sampleNotice: 'Поля заповнюються автоматично з вашого документа після завантаження.',
      cta: 'Перекласти свій документ →',
    },
    ru: {
      heading: 'Вот как выглядит готовый перевод',
      sub: 'Свидетельство о рождении · Образец (демо-данные)',
      watermark: 'ОБРАЗЕЦ — НЕ ДЕЙСТВИТЕЛЕН ДЛЯ ПОДАЧИ',
      docTitle: 'CERTIFICATE OF BIRTH',
      docSub: 'Translation from Ukrainian — Self-Certified under 8 CFR §103.2(b)(3)',
      certTitle: 'TRANSLATOR CERTIFICATION',
      certBody: 'I, [Translator Full Name], residing at [US Address], certify that I am competent to translate from Ukrainian to English, and that the above translation is accurate and complete to the best of my knowledge and belief.',
      certSig: 'Signature: _________________ Date: _____________',
      certAddr: 'Address: [123 Main St, City, State ZIP]',
      sampleNotice: 'Поля заполняются автоматически из вашего документа после загрузки.',
      cta: 'Перевести документ →',
    },
    es: {
      heading: 'Así luce la traducción terminada',
      sub: 'Certificado de nacimiento · Muestra (datos demo)',
      watermark: 'MUESTRA — NO VÁLIDO PARA PRESENTACIÓN',
      docTitle: 'CERTIFICATE OF BIRTH',
      docSub: 'Translation from Ukrainian — Self-Certified under 8 CFR §103.2(b)(3)',
      certTitle: 'TRANSLATOR CERTIFICATION',
      certBody: 'I, [Translator Full Name], residing at [US Address], certify that I am competent to translate from Ukrainian to English, and that the above translation is accurate and complete to the best of my knowledge and belief.',
      certSig: 'Signature: _________________ Date: _____________',
      certAddr: 'Address: [123 Main St, City, State ZIP]',
      sampleNotice: 'Los campos se completan automáticamente desde su documento después de la carga.',
      cta: 'Traducir su documento →',
    },
    en: {
      heading: 'This is what your translation looks like',
      sub: 'Birth Certificate · Sample (demo data)',
      watermark: 'SAMPLE — NOT VALID FOR FILING',
      docTitle: 'CERTIFICATE OF BIRTH',
      docSub: 'Translation from Ukrainian — Self-Certified under 8 CFR §103.2(b)(3)',
      certTitle: 'TRANSLATOR CERTIFICATION',
      certBody: 'I, [Translator Full Name], residing at [US Address], certify that I am competent to translate from Ukrainian to English, and that the above translation is accurate and complete to the best of my knowledge and belief.',
      certSig: 'Signature: _________________ Date: _____________',
      certAddr: 'Address: [123 Main St, City, State ZIP]',
      sampleNotice: 'Fields are filled automatically from your document after upload.',
      cta: 'Translate your document →',
    },
  }

  const t = text[locale as keyof typeof text] ?? text.en

  // All demo data — fictional person, historical dates, no real document numbers
  const fields = [
    { label: 'Last Name / Прізвище',          orig: 'ШЕВЧЕНКО',               en: 'SHEVCHENKO' },
    { label: 'Given Name / Ім\'я',             orig: 'ТАРАС ГРИГОРОВИЧ',       en: 'TARAS HRYHOROVYCH' },
    { label: 'Date of Birth / Дата народження',orig: '09.03.1814',             en: 'March 9, 1814' },
    { label: 'Place of Birth / Місце нар.',    orig: 'с. Моринці, Київська губ.',en: 'Moryntsi village, Kyiv Province' },
    { label: 'Sex / Стать',                    orig: 'чоловіча',               en: 'Male' },
    { label: 'Father / Батько',                orig: 'ГРИГОРІЙ ІВАНОВИЧ',      en: 'HRYHORII IVANOVYCH' },
    { label: 'Mother / Мати',                  orig: 'КАТЕРИНА ЯКИМІВНА',      en: 'KATERYNA YAKYMIVNA' },
    { label: 'Record No. / Актовий запис №',   orig: '—',                      en: 'Record No. 234' },
    { label: 'Record Date / Дата запису',      orig: '12.03.1814',             en: 'March 12, 1814' },
    { label: 'Issuing Authority / Орган вид.', orig: 'Звенигородський ДРАЦС',  en: 'Zvenyhorodka Civil Registry Office' },
    { label: 'Official Seal / Печатка',        orig: '[КРУГЛА ПЕЧАТКА]',       en: '[ROUND OFFICIAL SEAL — detected]' },
  ]

  return (
    <div style={{ position: 'relative', borderRadius: 16, border: '1px solid var(--border)', overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,.06)' }}>

      {/* ── Watermark overlay ── */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute', inset: 0, zIndex: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none',
        }}
      >
        <div style={{
          transform: 'rotate(-32deg)',
          fontSize: 'clamp(14px, 4vw, 22px)',
          fontWeight: 900,
          letterSpacing: '.08em',
          color: 'rgba(200,30,30,0.18)',
          textAlign: 'center',
          lineHeight: 1.3,
          userSelect: 'none',
          whiteSpace: 'nowrap',
        }}>
          {t.watermark}
        </div>
      </div>

      {/* ── Header ── */}
      <div style={{ background: '#1e40af', padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(191,219,254,.9)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 3 }}>
            {t.sub}
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>{t.heading}</div>
        </div>
        {/* Document icon */}
        <svg viewBox="0 0 28 34" width="28" height="34" fill="none" aria-hidden="true">
          <rect x="1" y="1" width="26" height="32" rx="3" fill="rgba(255,255,255,.12)" stroke="rgba(255,255,255,.6)" strokeWidth="1.2"/>
          <rect x="5" y="7" width="18" height="1.5" rx=".75" fill="rgba(255,255,255,.6)"/>
          <rect x="5" y="11" width="14" height="1.5" rx=".75" fill="rgba(255,255,255,.4)"/>
          <rect x="5" y="15" width="16" height="1.5" rx=".75" fill="rgba(255,255,255,.4)"/>
          <rect x="5" y="19" width="12" height="1.5" rx=".75" fill="rgba(255,255,255,.3)"/>
        </svg>
      </div>

      {/* ── Document title bar ── */}
      <div style={{ background: '#eff6ff', borderBottom: '1px solid #bfdbfe', padding: '10px 18px', textAlign: 'center' }}>
        <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: '.06em', color: '#1e3a8a' }}>{t.docTitle}</div>
        <div style={{ fontSize: 10, color: '#3b82f6', marginTop: 2, fontStyle: 'italic' }}>{t.docSub}</div>
      </div>

      {/* ── Field table ── */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr style={{ background: 'var(--surface-2, #f5f4f2)', borderBottom: '1px solid var(--border, #e8e5e0)' }}>
              <th style={{ textAlign: 'left', padding: '7px 14px', fontWeight: 700, color: 'var(--text-2, #6b6560)', width: '40%' }}>Field</th>
              <th style={{ textAlign: 'left', padding: '7px 14px', fontWeight: 700, color: 'var(--text-2, #6b6560)', width: '26%' }}>Original (UA)</th>
              <th style={{ textAlign: 'left', padding: '7px 14px', fontWeight: 700, color: '#1d4ed8', width: '34%' }}>Translation (EN)</th>
            </tr>
          </thead>
          <tbody>
            {fields.map((row, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--border, #e8e5e0)', background: i % 2 === 0 ? 'var(--surface-1, #fff)' : 'var(--surface-2, #f9f8f7)' }}>
                <td style={{ padding: '7px 14px', color: 'var(--text-2, #6b6560)', fontWeight: 600 }}>{row.label}</td>
                <td style={{ padding: '7px 14px', color: 'var(--text-1, #1a1714)', fontFamily: 'monospace', fontSize: 10 }}>{row.orig}</td>
                <td style={{ padding: '7px 14px', color: '#1d4ed8', fontWeight: 700 }}>{row.en}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Certification block ── */}
      <div style={{ background: '#1e40af', padding: '14px 18px', borderTop: '2px dashed rgba(255,255,255,.3)' }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: 'rgba(191,219,254,.9)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 6 }}>
          📋 {t.certTitle}
        </div>
        <p style={{ fontSize: 10, color: 'rgba(255,255,255,.9)', lineHeight: 1.7, marginBottom: 10, fontStyle: 'italic' }}>
          {t.certBody}
        </p>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,.7)', borderTop: '1px dashed rgba(255,255,255,.4)', paddingTop: 6, flex: '1 1 auto' }}>{t.certSig}</span>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,.6)', paddingTop: 6 }}>{t.certAddr}</span>
        </div>
      </div>

      {/* ── Sample notice ── */}
      <div style={{ background: '#fef2f2', borderTop: '1px solid #fecaca', padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 14 }}>⚠️</span>
        <p style={{ fontSize: 11, color: '#991b1b', fontWeight: 600, lineHeight: 1.5 }}>
          {t.sampleNotice}
        </p>
      </div>
    </div>
  )
}
