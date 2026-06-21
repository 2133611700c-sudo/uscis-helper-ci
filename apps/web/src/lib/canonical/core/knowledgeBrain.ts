/**
 * canonical/core/knowledgeBrain.ts — the ONE entry point product routes use to apply the D2
 * Knowledge Brain (ADR-017 §D2). No route may import individual dictionary functions or build
 * D2 context itself — everything goes through here, so there is ONE authority contract, not four.
 *
 * - isKnowledgeBrainEnabled()        — the flag (KNOWLEDGE_BRAIN_ENABLED, default ON; set =0 to disable).
 * - buildKnowledgeContext(input)     — derive the doc-level D2 context centrally (no route logic).
 * - applyKnowledgeBrainIfEnabled()   — arbitrate; apply D2 ONLY when the flag is ON. OFF ⇒ identical
 *                                      to bare arbitrateDocument (byte-identical product payloads).
 *
 * The dictionary is an AUTHORITY LAYER, never a silent auto-replace: a conflict on a value keeps the
 * read value and surfaces `suggestedValue` + review (see knowledgeNormalize.ts / arbitration.ts).
 */
import type { CanonicalField } from '../types'
import type { FieldCandidate } from './types'
import { arbitrateDocument, type KnowledgeArbitrationCtx } from './arbitration'
import { isKnowledgeBrainEnabled } from './knowledgeNormalize'
import { docintelIdToDocumentClass, isUkrainianIdentityDoc, isHardCase } from './documentClassPolicy'

export { isKnowledgeBrainEnabled } from './knowledgeNormalize'

export interface KnowledgeBrainInput {
  /** The docintel id / docTypeId the route is reading (e.g. 'ua_internal_passport_booklet'). */
  docTypeId?: string | null
  /** Which product is calling (for provenance only; behaviour is driven by docTypeId). */
  product?: 'translation' | 'tps' | 'reparole' | 'ead'
}

/**
 * Derive the doc-level knowledge context centrally. Routes pass only their docTypeId — the mapping
 * to documentClass / ukrainianDoc / historical lives here, so no route re-implements dictionary logic.
 */
export function buildKnowledgeContext(input: KnowledgeBrainInput): KnowledgeArbitrationCtx {
  const id = (input.docTypeId ?? '').trim()
  if (!id) return { documentClass: null, ukrainianDoc: false, isHistorical: false }
  const documentClass = docintelIdToDocumentClass(id)
  const ukrainianDoc = isUkrainianIdentityDoc(id)
  // Historical authority handling (Міліція, not Police) only for UA hard-case classes.
  const isHistorical = ukrainianDoc ? isHardCase(documentClass) : false
  return { documentClass, ukrainianDoc, isHistorical }
}

/**
 * Arbitrate candidates → CanonicalField[], applying the Knowledge Brain ONLY when the flag is ON.
 * Flag OFF (default) ⇒ returns exactly `arbitrateDocument(candidates)` — no D2, byte-identical.
 */
export function applyKnowledgeBrainIfEnabled(
  candidates: FieldCandidate[],
  context: KnowledgeArbitrationCtx,
): CanonicalField[] {
  return arbitrateDocument(candidates, isKnowledgeBrainEnabled() ? context : undefined)
}
