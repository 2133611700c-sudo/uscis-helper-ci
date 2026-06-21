/**
 * lib/upload/prepareImageForUpload — the SINGLE entry point every client upload
 * path uses, so image handling is identical across ALL products (translation /
 * TPS / EAD / re-parole). One free, client-side step:
 *   1. downscaleImageForUpload — keep the upload under Vercel's ~4.5MB body cap.
 *
 * Client-side OSD auto-rotation was REMOVED (2026-06-12): the Tesseract OSD path
 * rotated sideways photos the wrong direction (OSD reports the counter-clockwise
 * correction; the code applied it clockwise) → 90°/270° photos ended up 180° wrong,
 * corrupting more uploads than it fixed. Orientation is now handled at READ time by
 * the vision model ("mentally rotate" on the original, undamaged pixels). The MANUAL
 * rotate button (rotateImage90) bakes its rotation into the file before upload.
 *
 * Returns the prepared blob plus the file name. Always use this instead of calling
 * downscale directly, so a fix here applies to every wizard at once.
 */
import { downscaleImageForUpload, type DownscaleOptions } from './downscaleImage'

export async function prepareImageForUpload(
  file: File,
  opts?: DownscaleOptions,
): Promise<{ blob: Blob; name: string }> {
  const blob = await downscaleImageForUpload(file, opts ?? {})
  return { blob, name: file.name }
}
