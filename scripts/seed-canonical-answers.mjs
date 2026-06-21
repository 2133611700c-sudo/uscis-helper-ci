#!/usr/bin/env node
/**
 * seed-canonical-answers.mjs
 *
 * Seeds canonical_answers table from the vetted faqAnswers.ts data.
 * Groups entries by base slug (strips -en/-ru/-uk/-es suffix).
 * Upserts on slug — safe to re-run.
 *
 * Rules:
 * - is_published = false for all rows (draft — requires manual review before publishing)
 * - Only uses EXISTING vetted FAQ data — no invented answers
 * - No legal promises, no outcome guarantees in source data
 *
 * Usage:
 *   SUPABASE_URL=xxx SUPABASE_SERVICE_ROLE_KEY=xxx node scripts/seed-canonical-answers.mjs
 *   or: node -r ./scripts/_load-env.cjs scripts/seed-canonical-answers.mjs
 */

import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
import { resolve } from 'path'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in environment')
  console.error('Run: source .env.local && node scripts/seed-canonical-answers.mjs')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

// ---------------------------------------------------------------------------
// Load faqAnswers.ts by text extraction
// This is a seed script — simple JS evaluation of cleaned TS is fine.
// ---------------------------------------------------------------------------

const FAQ_FILE = resolve(process.cwd(), 'apps/web/src/data/faqAnswers.ts')
const rawTs = readFileSync(FAQ_FILE, 'utf-8')

function extractFaqAnswers(source) {
  // Strip TypeScript-specific syntax to get evaluatable JS
  const js = source
    // Remove all import lines
    .replace(/^import.*$/gm, '')
    // Remove export type { ... } lines
    .replace(/^export type \{[^}]*\}.*$/gm, '')
    // Remove export type alias lines
    .replace(/^export type .*$/gm, '')
    // Remove TS type annotations on const
    .replace(/: FAQAnswer\[\]/g, '')
    // Remove TS type annotations on function params and return types
    .replace(/: string/g, '')
    .replace(/: FAQAnswer/g, '')
    .replace(/ \| undefined/g, '')
    // Convert export const to const
    .replace(/\bexport\s+const\s+/g, 'const ')
    // Convert export function to function
    .replace(/\bexport\s+function\s+/g, 'function ')
    .trim()

  // Use Function constructor to get the array
  const fn = new Function(`${js}\nreturn faqAnswers;`)
  return fn()
}

let faqAnswers
try {
  faqAnswers = extractFaqAnswers(rawTs)
} catch (err) {
  console.error('Failed to parse faqAnswers.ts:', err.message)
  process.exit(1)
}

if (!Array.isArray(faqAnswers) || faqAnswers.length === 0) {
  console.error('ERROR: No FAQ answers extracted from source file')
  process.exit(1)
}

console.log(`Loaded ${faqAnswers.length} FAQ entries from source data`)

// ---------------------------------------------------------------------------
// Group by base slug (strip language suffix: -en, -ru, -uk, -es)
// ---------------------------------------------------------------------------

const byBaseSlug = new Map()

for (const entry of faqAnswers) {
  const langSuffix = entry.language
  const baseSlug = entry.id.endsWith(`-${langSuffix}`)
    ? entry.id.slice(0, -(langSuffix.length + 1))
    : entry.id

  if (!byBaseSlug.has(baseSlug)) {
    byBaseSlug.set(baseSlug, {})
  }
  byBaseSlug.get(baseSlug)[langSuffix] = entry
}

console.log(`Grouped into ${byBaseSlug.size} canonical answer rows`)

// ---------------------------------------------------------------------------
// Build upsert rows
// ---------------------------------------------------------------------------

const rows = []

for (const [slug, langs] of byBaseSlug) {
  const en = langs['en']
  const ru = langs['ru']
  const uk = langs['uk']

  if (!en) {
    console.warn(`Skipping ${slug}: no EN entry`)
    continue
  }

  rows.push({
    slug,
    question_en: en.question,
    answer_en: en.short_answer,
    question_ru: ru?.question ?? null,
    answer_ru: ru?.short_answer ?? null,
    question_uk: uk?.question ?? null,
    answer_uk: uk?.short_answer ?? null,
    category: en.topic,
    is_published: false,
    updated_at: new Date().toISOString(),
  })
}

console.log(`Prepared ${rows.length} rows for upsert`)

// ---------------------------------------------------------------------------
// Upsert in batches of 50
// ---------------------------------------------------------------------------

const BATCH_SIZE = 50
let upserted = 0
let errors = 0

for (let i = 0; i < rows.length; i += BATCH_SIZE) {
  const batch = rows.slice(i, i + BATCH_SIZE)

  const { error } = await supabase
    .from('canonical_answers')
    .upsert(batch, { onConflict: 'slug', ignoreDuplicates: false })

  if (error) {
    console.error(`Batch ${i}–${i + batch.length} error:`, error.message)
    errors += batch.length
  } else {
    upserted += batch.length
    console.log(`  Upserted rows ${i + 1}–${Math.min(i + BATCH_SIZE, rows.length)}`)
  }
}

// ---------------------------------------------------------------------------
// Verify final count
// ---------------------------------------------------------------------------

const { count: finalCount, error: countError } = await supabase
  .from('canonical_answers')
  .select('*', { count: 'exact', head: true })

if (countError) {
  console.error('Count query failed:', countError.message)
} else {
  console.log(`\n=== SEED COMPLETE ===`)
  console.log(`Upserted: ${upserted} rows`)
  console.log(`Errors:   ${errors}`)
  console.log(`Total rows in canonical_answers: ${finalCount}`)
}

if (errors > 0) process.exit(1)
