/**
 * lib/upload/autoRotate — client-side MANUAL document rotation.
 *
 * The automatic Tesseract-OSD auto-rotation was REMOVED (2026-06-12): its OSD
 * angle had the wrong sign (OSD reports the counter-clockwise correction; the
 * code rotated clockwise), so sideways phone photos were turned 180° wrong — it
 * corrupted more uploads than it fixed. Orientation is now handled at READ time
 * by the vision model ("mentally rotate" instruction), which works on the
 * original, undamaged pixels.
 *
 * What remains is the user-driven 90° rotate button (rotateImage90) — a reliable,
 * fixed transform the user controls. Browser-only (createImageBitmap + canvas).
 */

/** Rotate a bitmap CLOCKWISE by deg (90/180/270) onto a new canvas. */
function rotateBitmap(bitmap: ImageBitmap, deg: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  const swap = deg === 90 || deg === 270
  canvas.width = swap ? bitmap.height : bitmap.width
  canvas.height = swap ? bitmap.width : bitmap.height
  const ctx = canvas.getContext('2d')!
  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate((deg * Math.PI) / 180)
  ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2)
  return canvas
}

function canvasToFile(canvas: HTMLCanvasElement, name: string): Promise<File> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve(blob ? new File([blob], name, { type: 'image/jpeg' }) : new File([], name))
    }, 'image/jpeg', 0.92)
  })
}

/**
 * Manual 90°-clockwise rotation (the user-controlled rotate button). Each click
 * rotates the page another 90°. Fail-open: returns the original on any error.
 */
export async function rotateImage90(file: File): Promise<File> {
  if (typeof window === 'undefined' || typeof createImageBitmap !== 'function' || typeof document === 'undefined') return file
  if (!file.type.startsWith('image/')) return file
  let bitmap: ImageBitmap | null = null
  try {
    bitmap = await createImageBitmap(file)
    return await canvasToFile(rotateBitmap(bitmap, 90), file.name)
  } catch {
    return file
  } finally {
    bitmap?.close?.()
  }
}
