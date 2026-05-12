import { createHash } from 'crypto'

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export function hashJid(jid: string): string {
  // Strip the WhatsApp server suffix before hashing so the hash is purely numeric
  const bare = jid.replace(/@.+$/, '')
  return sha256(bare)
}

/**
 * Extracts the E.164 phone number from a WhatsApp user JID.
 * Returns null for non-user JIDs (@g.us groups, @lid anonymous IDs,
 * @broadcast, etc.) — these must not be stored as phone numbers.
 */
export function phoneFromJid(jid: string): string | null {
  if (!jid.includes('@s.whatsapp.net')) return null
  const bare = jid.replace(/@.+$/, '').replace(/:\d+$/, '') // strip @… and :device
  if (!/^\d{7,15}$/.test(bare)) return null                 // sanity: only digits, 7-15 chars
  return bare
}
