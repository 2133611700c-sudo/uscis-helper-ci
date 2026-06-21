/**
 * heicToJpeg — convert iPhone HEIC/HEIF uploads to JPEG before any pipeline step.
 *
 * Decoder: `heic-convert` (WASM libheif + libde265). NOT sharp — prebuilt
 * libvips ships libheif WITHOUT the HEVC codec (patent-encumbered), so
 * sharp fails on real iPhone HEIC with "compression format has not been
 * built in" — verified locally 2026-06-11 against a sips-generated fixture.
 *
 * Detection is by MIME OR magic bytes (browsers sometimes send HEIC with an
 * empty/octet-stream type). Fail-open: on any decode error the ORIGINAL
 * buffer+mime are returned and the normal validators reject it with the
 * standard message — never a 500.
 */
export function looksLikeHeic(buffer: Buffer, mimeType?: string | null): boolean {
  const m = (mimeType ?? '').toLowerCase()
  if (m === 'image/heic' || m === 'image/heif') return true
  // ISO-BMFF: bytes 4..8 = 'ftyp', brand at 8..12 in the HEIF family
  if (buffer.length < 12) return false
  if (buffer.subarray(4, 8).toString('latin1') !== 'ftyp') return false
  const brand = buffer.subarray(8, 12).toString('latin1')
  return ['heic', 'heix', 'hevc', 'heim', 'heis', 'mif1', 'msf1'].includes(brand)
}

export async function heicToJpeg(
  buffer: Buffer,
  mimeType?: string | null,
): Promise<{ buffer: Buffer; mimeType: string; converted: boolean }> {
  if (!looksLikeHeic(buffer, mimeType)) {
    return { buffer, mimeType: mimeType ?? 'image/jpeg', converted: false }
  }
  try {
    const convert = (await import('heic-convert')).default
    const jpeg = await convert({ buffer, format: 'JPEG', quality: 0.9 })
    return { buffer: Buffer.from(jpeg), mimeType: 'image/jpeg', converted: true }
  } catch (e) {
    console.warn('[heicToJpeg] decode failed, passing original through:', (e as Error)?.message)
    return { buffer, mimeType: mimeType ?? 'application/octet-stream', converted: false }
  }
}
