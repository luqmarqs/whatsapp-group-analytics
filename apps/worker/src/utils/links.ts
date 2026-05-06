import { sha256 } from './hash'

const URL_RE =
  /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&/=]*)/gi

export interface ExtractedLink {
  url: string
  urlHash: string
  domain: string
}

export function extractLinks(text: string): ExtractedLink[] {
  const matches = text.match(URL_RE) ?? []
  const seen = new Set<string>()
  const result: ExtractedLink[] = []

  for (const url of matches) {
    const urlHash = sha256(url.toLowerCase())
    if (seen.has(urlHash)) continue
    seen.add(urlHash)

    try {
      const { hostname } = new URL(url)
      result.push({ url, urlHash, domain: hostname.replace(/^www\./, '') })
    } catch {
      // malformed URL — skip
    }
  }

  return result
}
