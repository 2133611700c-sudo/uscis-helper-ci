import { createHash } from 'crypto'

export function normalize(content: string): string {
  return content.replace(/\s+/g, ' ').trim().toLowerCase()
}

export function sha256(content: string): string {
  return createHash('sha256').update(normalize(content)).digest('hex')
}

