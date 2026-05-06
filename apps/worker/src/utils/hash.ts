import { createHash } from 'crypto'

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export function hashJid(jid: string): string {
  // Strip the WhatsApp server suffix before hashing so the hash is purely numeric
  const bare = jid.replace(/@.+$/, '')
  return sha256(bare)
}
