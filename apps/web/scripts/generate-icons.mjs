/**
 * Generate PNG icons from inline SVG using sharp.
 * Run: node scripts/generate-icons.mjs
 */
import { createRequire } from 'module'
import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const sharp = require('sharp')

const ROOT = join(__dirname, '..')

// SVG source — matches Logo.tsx and icon.svg
const SVG = `<svg width="512" height="512" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="32" height="32" rx="7" fill="#4f46e5"/>
  <path d="M7 22V10h3.2l3.8 7.2L17.8 10H21v12h-3v-6.8L15 20.4h-2l-3-5.2V22H7z" fill="white"/>
  <path d="M25 9l-3-3v3h3z" fill="white" fill-opacity="0.3"/>
</svg>`

const svgBuf = Buffer.from(SVG)

async function generate(size, outPath) {
  mkdirSync(dirname(outPath), { recursive: true })
  await sharp(svgBuf).resize(size, size).png().toFile(outPath)
  console.log(`  ✓ ${outPath} (${size}×${size})`)
}

// OG image — simple branded 1200×630 placeholder
async function generateOg(outPath) {
  mkdirSync(dirname(outPath), { recursive: true })
  const ogSvg = `<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
    <rect width="1200" height="630" fill="#4f46e5"/>
    <rect x="40" y="40" width="1120" height="550" rx="24" fill="#312e81"/>
    <rect x="80" y="240" width="72" height="72" rx="16" fill="#4f46e5"/>
    <path d="M94 296V272h6.4l7.6 14.4L115.6 272H122v24h-6v-13.6L113 290h-4l-6-10.4V296H94z" fill="white"/>
    <path d="M147 268l-6-6v6h6z" fill="white" fill-opacity="0.3"/>
    <text x="170" y="296" font-family="system-ui,sans-serif" font-size="48" font-weight="700" fill="white">Messenginfo</text>
    <text x="80" y="380" font-family="system-ui,sans-serif" font-size="28" fill="#a5b4fc">Official-source immigration information</text>
    <text x="80" y="420" font-family="system-ui,sans-serif" font-size="22" fill="#818cf8">4 languages · Not a law firm</text>
  </svg>`
  await sharp(Buffer.from(ogSvg)).resize(1200, 630).png().toFile(outPath)
  console.log(`  ✓ ${outPath} (1200×630)`)
}

console.log('Generating icons...')
await Promise.all([
  generate(32, join(ROOT, 'public/favicon.png')),
  generate(180, join(ROOT, 'public/apple-touch-icon.png')),
  generate(192, join(ROOT, 'public/icons/icon-192.png')),
  generate(512, join(ROOT, 'public/icons/icon-512.png')),
  generateOg(join(ROOT, 'public/og/messenginfo-og.png')),
])

// Copy icon.svg to public
import { copyFileSync } from 'fs'
copyFileSync(join(ROOT, 'src/app/icon.svg'), join(ROOT, 'public/icon.svg'))
console.log(`  ✓ public/icon.svg (copied)`)

// Generate favicon.ico from 32×32 PNG
// (just copy the 32px PNG as favicon.ico — browsers accept PNG favicons)
copyFileSync(join(ROOT, 'public/favicon.png'), join(ROOT, 'public/favicon.ico'))
console.log(`  ✓ public/favicon.ico`)

console.log('Done.')
