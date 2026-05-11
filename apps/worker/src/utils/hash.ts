import { createHash } from 'crypto'

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export function hashJid(jid: string): string {
  // Strip the WhatsApp server suffix before hashing so the hash is purely numeric
  const bare = jid.replace(/@.+$/, '')
  return sha256(bare)
}

export function phoneFromJid(jid: string): string {
  // Examples: 5511999999999@s.whatsapp.net or 5511999999999:2@s.whatsapp.net (multi-device)
  return jid.replace(/@.+$/, '').replace(/:\d+$/, '')
}
