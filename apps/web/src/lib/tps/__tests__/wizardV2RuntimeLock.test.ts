import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const wizardV2Path = path.join(
  process.cwd(),
  'src/app/[locale]/services/tps-ukraine/start/TPSWizardV2.tsx',
)

describe('TPS Wizard V2 runtime hardening lock', () => {
  it('keeps stable selector contract for production contour', () => {
    const src = fs.readFileSync(wizardV2Path, 'utf-8')
    const requiredSelectors = [
      'nextTestId="tps-ocr-cta"',
      'data-testid={`tps-upload-slot-${doc.id}`}',
      'data-testid={`tps-upload-input-${doc.id}`}',
      'data-testid="tps-review-step-container"',
      'nextTestId="tps-step6-continue-cta"',
      'data-testid="tps-signature-mode-block"',
      'data-testid="tps-generate-cta"',
      'data-testid="tps-paywall-state"',
      'data-testid="tps-gate-error-container"',
      'data-testid="tps-download-success-state"',
    ]
    for (const token of requiredSelectors) {
      expect(src).toContain(token)
    }
  })

  it('gates step 6 transition with preflight truth checks', () => {
    const src = fs.readFileSync(wizardV2Path, 'utf-8')
    expect(src).toContain('const runPreflightForStep6 = useCallback((): boolean => {')
    expect(src).toContain('if (extractedCount === 0)')
    expect(src).toContain('runMailReadyGate(buildDraftAnswers(), allConflicts, allLowConf)')
    expect(src).toContain('if (runPreflightForStep6()) goto(6)')
  })

  it('does not unlock paywall/generate solely from paid callback memory', () => {
    const src = fs.readFileSync(wizardV2Path, 'utf-8')
    expect(src).toContain('const isStep6Eligible = useMemo(() => {')
    expect(src).toContain('setStep(6)')
    expect(src).toContain('!isOwner && !data.paid && isStep6Eligible')
    expect(src).toContain('(isOwner || data.paid) && isStep6Eligible')
  })

  it('marks successful generation only after real response bytes', () => {
    const src = fs.readFileSync(wizardV2Path, 'utf-8')
    expect(src).toContain('setGeneratedManifest({ at: new Date().toISOString(), zipBytes: blob.size })')
    expect(src).toContain('data-testid="tps-download-success-state"')
  })
})
