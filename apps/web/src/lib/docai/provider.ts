/**
 * Google Document AI OCR Provider — Messenginfo TPS
 *
 * Wraps the DocAI client to match the OcrResult interface used by
 * the existing TPS pipeline. Drop-in replacement for google-vision
 * when DOCAI_ENABLED=true.
 */

import { processDocument, isDocAIEnabled } from './client'
import type { OcrResult, OcrPage, OcrLine, OcrWord, OcrBoundingBox } from '../ocr/types'

const ZERO_BOX: OcrBoundingBox = { x: 0, y: 0, width: 0, height: 0 }

export const docAIProvider = {
  name: 'google_docai',

  async extractText({ imageBuffer, mimeType }: {
    imageBuffer: Buffer
    mimeType: string
  }): Promise<OcrResult> {
    const result = await processDocument(imageBuffer, mimeType)
    if (!result.ok) {
      return {
        provider: 'google_docai', raw_text: '', pages: [], lines: [], words: [],
        processing_ms: 0, warnings: [`docai_error:${result.errorCode}:${result.error}`],
        created_at: new Date().toISOString(),
      }
    }
    const allLines: OcrLine[] = []
    const allWords: OcrWord[] = []
    const pages: OcrPage[] = result.pages.map((p, pageIdx) => {
      const pageLines: OcrLine[] = p.lines.map((line, lineIdx) => {
        const lineId = `l_${String(pageIdx * 100 + lineIdx).padStart(4, '0')}`
        const words: OcrWord[] = line.text.split(/\s+/).filter(Boolean).map((w, wIdx) => ({
          id: `w_${String(pageIdx * 1000 + lineIdx * 10 + wIdx).padStart(4, '0')}`,
          text: w,
          page: pageIdx + 1,
          bbox: ZERO_BOX,
          confidence: line.confidence,
          source: 'google_docai',
        }))
        allWords.push(...words)
        const ocrLine: OcrLine = {
          id: lineId,
          text: line.text,
          page: pageIdx + 1,
          bbox: ZERO_BOX,
          words,
          confidence: line.confidence,
          source: 'google_docai',
        }
        allLines.push(ocrLine)
        return ocrLine
      })
      return { page: pageIdx + 1, width: p.width, height: p.height, lines: pageLines, words: pageLines.flatMap((l) => l.words) }
    })

    return {
      provider: 'google_docai',
      raw_text: result.text,
      pages, lines: allLines, words: allWords,
      processing_ms: result.processingTimeMs,
      warnings: [],
      created_at: new Date().toISOString(),
    }
  },
}

export { isDocAIEnabled }
