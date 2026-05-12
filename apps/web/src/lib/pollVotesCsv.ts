import { Poll, PollVote } from './api'

function csvText(value: string | number | null | undefined) {
  if (value == null) return ''
  const text = String(value)
  return /^[\d+@.-]+$/.test(text) ? `="${text}"` : text
}

function safeFilePart(value: string) {
  return value.replace(/[^a-z0-9]/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase()
}

export function downloadPollVotesCsv(poll: Poll, votes: PollVote[]) {
  const headers = [
    'Enquete',
    'Grupo',
    'JID do grupo',
    'Opcao',
    'Indice da opcao',
    'Nome',
    'Telefone',
    'Identificador WhatsApp',
    'Tipo ID',
    'Votou em',
  ]

  const rows = votes.map((vote) => [
    vote.title || poll.title,
    vote.group_name ?? poll.group_name ?? poll.group_jid,
    csvText(vote.group_jid || poll.group_jid),
    vote.option_text || 'Opcao sem texto',
    vote.option_index + 1,
    vote.name ?? '',
    vote.phone ? `="${vote.phone}"` : '',
    vote.raw_jid ? `="${vote.raw_jid}"` : '',
    vote.jid_server ?? '',
    vote.voted_at ? new Date(vote.voted_at).toLocaleString('pt-BR') : '',
  ])

  const csv = [headers, ...rows]
    .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';'))
    .join('\r\n')

  const stamp = new Date().toISOString().slice(0, 10)
  const name = safeFilePart(poll.title || poll.id) || poll.id
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `votos-enquete-${name}-${stamp}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
